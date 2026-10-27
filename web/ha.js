/*
 * Home Assistant in the bottom drawer, as on Android (HomeAssistant.java): the entities in config.properties
 * (ha_url, ha_token, ha_entities), each a button that toggles it (lights, switches, fans, covers), runs it (scenes,
 * scripts, buttons) or shows its value (sensors; locks only show theirs: a remote's stray OK must not open a door).
 * States come from HA's REST API when the drawer opens and after a press. Plain ES5.
 */
var HA = (function () {
  'use strict';

  var STALE_MS = 15000;
  var TOGGLE = ['light', 'switch', 'fan', 'input_boolean', 'automation', 'siren', 'humidifier', 'media_player'];
  var RUN = ['scene', 'script'];
  var PRESS = ['button', 'input_button'];
  var ON = ['on', 'open', 'opening', 'playing', 'home'];

  var url = String(CONFIG.haUrl || '').replace(/\/+$/, ''), token = String(CONFIG.haToken || '');
  var entities = (CONFIG.haEntities || []).filter(function (e) { return e.id.indexOf('.') > 0; }).map(function (e) {
    return {id: e.id, custom: e.name || '', name: e.name || '', state: '', unit: ''};
  });
  var fetchedAt = 0, fetching = false;

  function domain(id) { return id.slice(0, id.indexOf('.')); }

  /** Something to do on OK; otherwise the button only shows the entity's value. */
  function pressable(id) {
    var d = domain(id);
    return TOGGLE.indexOf(d) >= 0 || d === 'cover' || RUN.indexOf(d) >= 0 || PRESS.indexOf(d) >= 0;
  }

  function symbol(id) {
    switch (domain(id)) {
      case 'light': return 'lightbulb';
      case 'fan': return 'fan';
      case 'cover': return 'blinds';
      case 'scene': case 'script': return 'sparkles';
      case 'button': case 'input_button': return 'play';
      case 'media_player': return 'speaker';
      case 'switch': case 'input_boolean': case 'automation': case 'siren': case 'humidifier': return 'toggle_on';
      default: return 'sensors';
    }
  }

  function value(e) {
    switch (e.state) {
      case '': case 'unknown': case 'unavailable': return '–';
      case 'on': return tr('On');
      case 'off': return tr('Off');
      default: return e.unit ? e.state + ' ' + e.unit : e.state;
    }
  }

  function configured() { return !!url && !!token && entities.length > 0; }

  function call(method, path, body, done) { TV.homeAssistant(url, token, method, path, body, done); }

  return {
    /** The address, the token and at least one entity came with the build. */
    configured: configured,

    /** The drawer's buttons, from the last states read: [{id, label, symbol, on, value}] (value: a sensor's). */
    items: function () {
      if (!configured() || !Prefs.homeAssistant()) return [];
      return entities.map(function (e) {
        return {id: e.id, label: e.name || e.id, symbol: symbol(e.id), on: ON.indexOf(e.state) >= 0,
          value: pressable(e.id) ? null : value(e)};
      });
    },

    /** Reads every entity's state (unless it just did); changed() runs when something is new. */
    refresh: function (changed) {
      if (!configured() || fetching || new Date().getTime() - fetchedAt < STALE_MS) return;
      fetching = true;
      var left = entities.length, any = false;
      entities.forEach(function (e) {
        call('GET', '/api/states/' + e.id, null, function (err, text) {
          var o = null;
          try { o = err ? null : JSON.parse(text); } catch (x) {}
          var state = o ? String(o.state) : 'unavailable', attrs = (o && o.attributes) || {};
          var name = e.custom || attrs.friendly_name || '', unit = attrs.unit_of_measurement || '';
          if (state !== e.state || name !== e.name || unit !== e.unit) any = true;
          e.state = state;
          e.name = name;
          e.unit = unit;
          if (--left > 0) return;
          fetching = false;
          fetchedAt = new Date().getTime();
          if (any) changed();
        });
      });
    },

    /** OK on an entity's button: toggles it, runs it or presses it; done(ok) once HA answers. */
    press: function (id, done) {
      var d = domain(id);
      var service = TOGGLE.indexOf(d) >= 0 ? 'homeassistant/toggle' : d === 'cover' ? 'cover/toggle'
          : RUN.indexOf(d) >= 0 ? d + '/turn_on' : PRESS.indexOf(d) >= 0 ? d + '/press' : null;
      if (!service || !configured()) return;
      for (var i = 0; i < entities.length; i++) {
        // Shown at once; the real state comes with the next read.
        if (entities[i].id === id && TOGGLE.indexOf(d) >= 0) entities[i].state = ON.indexOf(entities[i].state) >= 0 ? 'off' : 'on';
      }
      call('POST', '/api/services/' + service, {entity_id: id}, function (err) {
        fetchedAt = 0;   // read the new states at once
        done(!err);
      });
    }
  };
})();
