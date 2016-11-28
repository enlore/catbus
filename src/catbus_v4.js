/**
 * catbus.js (v3.0.0) --
 *
 * Copyright (c) 2016 Scott Southworth, Landon Barnickle, Nick Lorenson & Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this
 * file except in compliance with the License. You may obtain a copy of the License at:
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 *
 * @authors Scott Southworth @darkmarmot, Landon Barnickle @landonbar, Nick Lorenson @enlore
 *
 */

;(function(){

    "use strict";

    // utility methods -- based on lodash


    function toNumber(n){
        return typeof n === 'number' ? n : 0;
    }

    function delay(func, wait) {

        var lastArgs,
            lastThis,
            result,
            timerId;

        if (typeof func != 'function') {
            //throw new TypeError(); todo make error here
        }

        wait = toNumber(wait);

        function invokeFunc() {

            var args = lastArgs,
                thisArg = lastThis;

            lastArgs = lastThis = undefined;
            result = func.apply(thisArg, args);
            return result;

        }

        function cancel() {
            if (timerId !== undefined) {
                clearTimeout(timerId);
            }
            lastArgs = lastThis = timerId = undefined;
        }

        function flush() {
            return timerId === undefined ? result : invokeFunc();
        }

        function delayed() {

            lastArgs = arguments;
            lastThis = this;

            timerId = setTimeout(invokeFunc, wait);

            return result;

        }

        delayed.cancel = cancel;
        delayed.flush = flush;
        return delayed;

    }

    function debounce(func, wait, options) {

        var lastArgs,
            lastThis,
            maxWait,
            result,
            timerId,
            lastCallTime,
            lastInvokeTime = 0,
            leading = false,
            maxing = false,
            trailing = true;

        if (typeof func != 'function') {
            //throw new TypeError(); todo make error here
        }

        wait = toNumber(wait);
        if (options && typeof options === 'object') {
            leading = !!options.leading;
            maxing = 'maxWait' in options;
            maxWait = maxing ? Math.max(toNumber(options.maxWait) || 0, wait) : maxWait;
            trailing = 'trailing' in options ? !!options.trailing : trailing;
        }

        function invokeFunc(time) {
            var args = lastArgs,
                thisArg = lastThis;

            lastArgs = lastThis = undefined;
            lastInvokeTime = time;
            result = func.apply(thisArg, args);
            return result;
        }

        function leadingEdge(time) {
            // Reset any `maxWait` timer.
            lastInvokeTime = time;
            // Start the timer for the trailing edge.
            timerId = setTimeout(timerExpired, wait);
            // Invoke the leading edge.
            return leading ? invokeFunc(time) : result;
        }

        function remainingWait(time) {
            var timeSinceLastCall = time - lastCallTime,
                timeSinceLastInvoke = time - lastInvokeTime,
                result = wait - timeSinceLastCall;

            return maxing ? Math.min(result, maxWait - timeSinceLastInvoke) : result;
        }

        function shouldInvoke(time) {
            var timeSinceLastCall = time - lastCallTime,
                timeSinceLastInvoke = time - lastInvokeTime;

            // Either this is the first call, activity has stopped and we're at the
            // trailing edge, the system time has gone backwards and we're treating
            // it as the trailing edge, or we've hit the `maxWait` limit.
            return (lastCallTime === undefined || (timeSinceLastCall >= wait) ||
            (timeSinceLastCall < 0) || (maxing && timeSinceLastInvoke >= maxWait));
        }

        function timerExpired() {
            var time = Date.now();
            if (shouldInvoke(time)) {
                return trailingEdge(time);
            }
            // Restart the timer.
            timerId = setTimeout(timerExpired, remainingWait(time));
        }

        function trailingEdge(time) {
            timerId = undefined;

            // Only invoke if we have `lastArgs` which means `func` has been
            // debounced at least once.
            if (trailing && lastArgs) {
                return invokeFunc(time);
            }
            lastArgs = lastThis = undefined;
            return result;
        }

        function cancel() {
            if (timerId !== undefined) {
                clearTimeout(timerId);
            }
            lastInvokeTime = 0;
            lastArgs = lastCallTime = lastThis = timerId = undefined;
        }

        function flush() {
            return timerId === undefined ? result : trailingEdge(Date.now());
        }

        function debounced() {
            var time = now(),
                isInvoking = shouldInvoke(time);

            lastArgs = arguments;
            lastThis = this;
            lastCallTime = time;

            if (isInvoking) {
                if (timerId === undefined) {
                    return leadingEdge(lastCallTime);
                }
                if (maxing) {
                    // Handle invocations in a tight loop.
                    timerId = setTimeout(timerExpired, wait);
                    return invokeFunc(lastCallTime);
                }
            }
            if (timerId === undefined) {
                timerId = setTimeout(timerExpired, wait);
            }
            return result;
        }
        debounced.cancel = cancel;
        debounced.flush = flush;
        return debounced;
    }


    var catbus = {};
    var externalContext = this;

    catbus.$ = {};

    var plugins = typeof seele !== 'undefined' && seele;
    if(plugins)
        plugins.register('catbus', catbus, true);
    else
        externalContext.Catbus = catbus;


    function createFunctor(val) {
        //if(val === undefined) return undefined;
        return (typeof val === 'function') ? val : function() { return val; };
    }

    function toNameArray(arg, delimiter){

        if(typeof arg === 'string'){
            return stringToTrimmedArray(arg, delimiter);
        }

        return arg;

    }
    
    function stringToTrimmedArray(str, delimiter){

        delimiter = delimiter || ',';
        var arr = str.split(delimiter);
        var result = [];
        for(var i = 0; i < arr.length; i++){
            var chunk = arr[i];
            var trimmed_chunk = chunk.trim();
            if(trimmed_chunk)
                result.push(trimmed_chunk);
        }

        return result;
    }


    catbus.uid = 0;
    catbus._datas = {};
    catbus._hosts = {}; // hosts by name
    catbus._primed = false;
    catbus._queueFrame = [];
    catbus._defaultScope = null;
    
    catbus.dropHost = function(name){

        var hosts = catbus._hosts;
        var host = hosts[name];

        if(!host) return false;

        for(var id in host._sensorMap){
            var sensor = host._sensorMap[id];
            sensor.drop();
        }

        delete hosts[name];
    };

    catbus.demandPlace = catbus.demandScope = function(name){
        var root = catbus._defaultScope = catbus._defaultScope || new Scope();
        return root.demandChild(name);
    };

    catbus.demandData = catbus.data = function(nameOrNames){
        var scope = catbus._defaultScope = catbus._defaultScope || new Scope();
        return scope.demandData(nameOrNames);
    };

    catbus.envelope = function(msg, topic, tag){
        return new Envelope(msg, topic, tag);
    };

    catbus.queue = function(sensor) {

        var arr = this._queueFrame;
        arr.push(sensor);

        if (this._primed) return;
        this._primed = true;

        if(typeof window !== 'undefined' && window.requestAnimationFrame) requestAnimationFrame(this.flush.bind(this));
        else process.nextTick(this.flush.bind(this));

    };


    catbus.flush = function(){

        this._primed = false;

        var passes = 0;

        while(this._queueFrame.length > 0) {

            passes++;
            var arr = this._queueFrame;
            this._queueFrame = [];

            while(arr.length){
                var sensor = arr.shift();
                sensor.send();
            }

        }

    };


    var Envelope = function(msg, topic, tag){

        this.msg = msg;
        this.topic = topic;
        this.tag = tag;
        this.id = ++catbus.uid;
        this.sent = Date.now();

    };

    
    var Scope = function(name) {

        this._id = ++catbus.uid;
        this._name = name || this._id;
        this._parent = null;
        this._children = {}; // by name
        this._dimensions = {data: {}}; // by dimension then data name
        this._valves = null;
        this._sensors = {}; // by id
        this._dropped = false;

    };

    var Zone = Scope; // hack for now


    Scope.prototype.drop = function(){

        var i, key;

        if(this._dropped) return;

        var child_keys = Object.keys(this._children);
        for(i = 0; i < child_keys.length; i++){
            key = child_keys[i];
            var child = this._children[key];
            child.assignParent(null);
        }

        var sensor_keys = Object.keys(this._sensors);
        for(i = 0; i < sensor_keys.length; i++){
            key = sensor_keys[i];
            var sensor = this._sensors[key];
            sensor.drop();
        }

        var data_keys = Object.keys(this._datas);
        for(i = 0; i < data_keys.length; i++){
            key = data_keys[i];
            var data = this._datas[key];
            data.drop(true);
        }


        this._datas = null;
        this._sensors = null;
        this._children = null;
        this._valves = null;
        this._parent = null;
        this._dropped = true;


    };

    Scope.prototype.snapshot = function(){

        var result = {id: this._id, name: this._name, children: [], data: [], sensors: [], valves: [], parent: this._parent && this._parent._name};
        var p;

        for(p in this._children) { result.children.push(p); };
        for(p in this._datas) { result.data.push(p); };
        for(p in this._sensors) { result.data.push(p); };

        if(this._valves)
            for(p in this._valves) { result.children.push(p); };

        return result;
    };

    Scope.prototype.demandChild = function(name){
        return this._children[name] || this._createChild(name);
    };

    Scope.prototype._createChild = function(name, isRoute){
        var child = new Scope(name, isRoute);
        child.assignParent(this);
        return child;
    };

    Scope.prototype.insertParent = function(newParent){

        var oldParent = this._parent;
        newParent.assignParent(oldParent);
        this.assignParent(newParent);
        return this;
    };

    Scope.prototype.assignParent = function(newParent){

        var oldParent = this._parent;
        if(oldParent)
            delete oldParent._children[this._name];
        this._parent = newParent;

        if(newParent) {
            newParent._children[this._name] = this;
        }
        
        return this;

    };
    

    Scope.prototype.sensor = Scope.prototype.createSensor = function(){

        var sensor = new Sensor();
        sensor.scope(this);
        return sensor;

    };

    Scope.prototype.demandData = Scope.prototype.demandData = function (nameOrNames){

        var names = toNameArray(nameOrNames);

        if(names.length === 1)
            return this._demandData(names[0]);

        // if an array of names, return a multi-data
        var multiLoc = this._demandData();
        var datas = multiLoc._multi = [];

        for(var i = 0; i < names.length; i++){
            var name = names[i];
            datas.push(this._demandData(name));
        }

        return multiLoc;

    };

    Scope.prototype._demandDimension = function(dimension){

        return this._dimensions[dimension] = this._dimensions[dimension] || {};

    };

    Scope.prototype._demandData = function(name, dimension){

        dimension = dimension || 'data';
        var datas = this._dimensions[dimension];
        var data = datas[name];

        if(!data) {

            data = new Data(name);
            datas[data._name] = data;
            data._scope = this;

        }

        return data;

    };

    Scope.prototype.findData = function(nameOrArray, where, optional){

        var arr = toNameArray(nameOrArray);
        var data;
        var data_list = [];
        var result = null;

        if(!arr)
            return null;

        for(var i = 0; i < arr.length; i++){
            var name = arr[i];
            if(typeof name === 'object')
                data = name;
            else
                data = this._findData(name, where, optional);
            if(data)
                data_list.push(data);
        }

        if(data_list.length > 1){
            result = this._demandData();
            result._multi = data_list;
        } else if (data_list.length === 1) {
            result = data_list[0];
        }

        return result;

    };

    Scope.prototype._findData = function(name) {
            return this._findFirst(name);
    };

    Scope.prototype.getData = function(name) {
        return this._getData(name);
    };


    Scope.prototype._getData = function(name) {
        return this._datas[name] || null;
    };


    Scope.prototype.valves = function(valves){

        var hash = null;

        if(valves && valves.length > 0){
            hash = {};
            for(var i = 0; i < valves.length; i++){
                var name = valves[i];
                hash[name] = true;
            }
        }

        this._valves = hash;
        return this;

    };

    Scope.prototype._findFirstIn = function(name, containerName) {

        var scope = this;
        var checkValve = false;

        do {

            if(checkValve && scope._valves && !scope._valves[name])
                return null; // not white-listed by a valve

            checkValve = true; // not checked at the local level

            if(scope._name === containerName) {
                var result = scope._datas[name];
                if (result)
                    return result;
            }

        } while (scope = scope._parent);

        return null;
    };

    Scope.prototype._findFirst = function(name, fromParent) {

        var scope = this;
        var checkValve = fromParent || false;

        do {

            if(checkValve && scope._valves && !scope._valves[name])
                return null; // not white-listed by a valve

            checkValve = true; // not checked at the local level

            var result = scope._datas[name];
            if (result)
                return result;

        } while (scope = scope._parent);

        return null;
    };

    Scope.prototype._findFromParent = function(name) {

        var parent = this._parent;
        if(!parent) return null;
        return parent._findFirst(name, true);

    };

    Scope.prototype._findOuter = function(name) {

        var scope = this;
        var found = false;
        var checkValve = false;

        do {

            if(checkValve && scope._valves && !scope._valves[name])
                return null; // not white-listed by a valve on the cog

            checkValve = true; // not checked at the local level (valves are on the bottom of cogs)

            var result = scope._datas[name];
            if (result) {
                if(found)
                    return result;
                found = true;
            }
        } while (scope = scope._parent);

        return null;

    };

    Scope.prototype._findLast = function(name) {

        var scope = this;
        var result = null;
        var checkValve = false;

        do {

            if(checkValve && scope._valves && !scope._valves[name])
                return null; // not white-listed by a valve

            checkValve = true; // not checked at the local level

            result = scope._datas[name] || result;

        } while (scope = scope._parent);

        return result;

    };

    var Cluster = function(topic, data) {
        this._data = data;
        this._topic = topic;
        this._sensors = [];
        this._lastEnvelope = null;
        this._dropped = false;
    };

    Cluster.prototype._drop = function(){

        if(this._dropped) return;

        for(var i = 0; i < this._sensors.length; i++){
            var sensor = this._sensors[i];
            sensor.drop();
        }

        this._data = null;
        this._lastEnvelope = null;
        this._sensors = null;

        this._dropped = true;

    };

    Cluster.prototype._add = function(sensor){
        this._sensors.push(sensor);
    };

    Cluster.prototype._remove = function(sensor){
        var i = this._sensors.indexOf(sensor);
        if(i == -1) return;
        this._sensors.splice(i,1);
    };

    Cluster.prototype._tell = function(msg, topic, tag){
        if(this._dropped) return;
        this._lastEnvelope = catbus.envelope(msg, topic, tag); // message stored enveloped before sending and transforming
        var sensors = [].concat(this._sensors);
        for(var i = 0; i < sensors.length; i++){
            var sensor = sensors[i];
            sensor.tell(msg, topic, tag);
        }
    };

    var Host = function(name){
        this._name = name;
        this._sensorMap = {};
    };


    var Sensor = function() {

        this._scope = null;
        this._multi = null; // list of sensors to process through sensor api
        this._callback = null;
        this._context = null;
        this._max = null;
        this._host = null;
        this._bus = catbus;
        this._batch = false;
        this._group = false;
        this._batchedByTag = {};
        this._batchedAsList = [];
        this._keep = null; // last or first or all or null (not batching)
        this._trigger = null;
        this._pipe = false;
        this._change = null;
        this._needs = []; // array of tags needed before firing
        this._retain = false; // will retain prior tag messages
        this._last = null;
        this._name = null;
        this._cmd = null;
        this._postcard = null; // wrapped msg about to be sent...
        this._active = true;
        this._id = ++catbus.uid;
        this._appear = undefined;
        this._extract = null;
        this._lastAppearingMsg = undefined;
        this._dropped = false;
        this._locked = false;
        this._optional = false; // optional data to watch
        this._mergeLoc = null; // an autogenerated Data to hold merged data
        this._cluster = null;
        this._delay = null;
        this._cancel = null;

        this._timeoutId = null;

    };

    // todo add data and sensor reset methods, use with object pooling

    Sensor.prototype.throwError = function(msg){
        throw {error:"Catbus: Sensor", msg: msg, topic: this._getTopic(), tag: this._getTag() };
    };


    var sensor_config = {

        trigger: {name: 'trigger', prop: '_trigger', setter: '_setTrigger'},
        last: {name: 'last', prop: '_keep', setter: '_setLast'},
        first: {name: 'first', prop: '_keep', setter: '_setFirst'},
        all: {name: 'all', prop: '_keep', setter: '_setAll'},
        sync: {name: 'sync', prop: '_keep', setter: '_setSync'},
        keep: {name: 'keep', options: ['last', 'first', 'all'], prop: '_keep', default_set: 'last'},
        retain: {name: 'retain', type: 'boolean', prop: '_retain', default_set: true},
        need: {name: 'need', transform: '_toStringArray', valid: '_isStringArray', prop: '_needs'}, // todo, also accept [locs] to tags
        gather: {name: 'gather', transform: '_toStringArray', valid: '_isStringArray', prop: '_gather'}, // todo, also accept [locs] to tags
        host:  {name: 'host', transform: '_toString', type: 'string', setter: '_setHost', prop: '_host'},
        scope:  {name: 'scope', valid: '_isScope', setter: '_setScope', prop: '_scope'},
        batch: {name: 'batch', type: 'boolean' , prop: '_batch', default_set: true, setter: '_setBatch'},
        change: {name: 'change', type: 'function', prop: '_change', default_set: function(msg){ return msg;}},
        optional: {name: 'optional', type: 'boolean' , prop: '_optional', default_set: true},
        group: {name: 'group', type: 'function', prop: '_group', functor: true, default_set: function(msg, topic, name){ return name;}},
        pipe: {name: 'pipe', valid: '_isData', prop: '_pipe'},
        emit: {name: 'emit', prop: '_emit', functor: true, default_set: function(msg, topic, name){ return topic;}},
        name: {name: 'name', type: 'string' , prop: '_name'},
        cmd: {name: 'cmd', type: 'string', prop: '_cmd'},
        active: {name: 'active', type: 'boolean' , prop: '_active', default_set: true},
        sleep: {name: 'sleep', no_arg: true , prop: '_active', default_set: false},
        wake: {name: 'wake', no_arg: true , prop: '_active', default_set: true},
        on: {name: 'on', alias: ['topic','sense'], type: 'string' , setter: '_setTopic', getter: '_getTopic'},
        exit:  {name: 'exit', alias: ['transform'], type: 'function', functor: true, prop: '_transformMethod',
            default_set: function(msg, topic, name){ return msg;}},
        enter: {name: 'enter', alias: ['conform','adapt'], type: 'function', functor: true, prop:'_appear',
            default_set: function(msg, topic, name){ return msg;}},
        extract: {name: 'extract',  transform: '_toString', type: 'string', prop:'_extract'},
        run: {name: 'run', type: 'function' , prop: '_callback'},
        filter: {name: 'filter', type: 'function' , prop: '_filter'},
        cancel: {name: 'cancel', type: 'function' , prop: '_cancel'},
        as: {name: 'as', type: 'object' , prop: '_context'},
        delay:  {name: 'delay', transform: '_toInt', type: 'number' , prop: '_delay'},
        max:  {name: 'max', transform: '_toInt', type: 'number' , prop: '_max'},
        once:  {name: 'once', no_arg: true, prop: '_max', default_set: 1},
        tag: {name: 'tag', getter: '_getTag', prop: '_tag', functor: true}

    };

    // build chaining setters from config

    var config_name;
    var config;

    for(config_name in sensor_config){
        config = sensor_config[config_name];
        var alias = config.alias;
        if(alias){
            for(var i = 0; i < alias.length; i++){
                var alias_name = alias[i];
                sensor_config[alias_name] = config;
            }
        }
    }

    for(config_name in sensor_config){

        config = sensor_config[config_name];

        if(config.no_write)
            continue;

        (function(name, props){

            Sensor.prototype[name] = function(value){

                if(this._multi){
                    if(arguments.length === 0)
                        if(props.hasOwnProperty('default_set'))
                            return this._setMultiAttr(name, props.default_set);
                        else
                            return this._setMultiAttr(name);
                    else
                        return this._setMultiAttr(name, value);
                }

                if(arguments.length === 0)
                    if(props.hasOwnProperty('default_set'))
                        return this._setAttr(name, props.default_set);
                    else
                        return this._setAttr(name);
                else
                    return this._setAttr(name, value);
            };

        })(config_name, config);

    }

    Sensor.prototype._toInt = function(num){
        return Math.floor(num);
    };

    Sensor.prototype._getTopic = function(){
        return this._cluster && this._cluster._topic;
    };

    Sensor.prototype._getTag = function(){
        if(this._tag)
            return this._tag;
        var loc = this._getData();
        return loc && loc.tag();
    };

    Sensor.prototype._getData = function(){
        return this._cluster && this._cluster._data;
    };

    Sensor.prototype._isData = function(data){
        return data instanceof Data;
    };

    Sensor.prototype.toArray = function(){
        if(this._multi)
            return this._multi;
        else
            return [this];
    };


    Sensor.prototype._isScope = function(scope){ // scope can be set to null only if a sensor is already dropped
        return (this._dropped && !scope) || scope instanceof Scope;
    };

    Sensor.prototype._toStringArray = function(stringOrStringArray){
        var arr;
        if(typeof stringOrStringArray === 'string')
            arr = stringOrStringArray.split(/,|\./);
        else
            arr = stringOrStringArray;

        for(var i = 0; i > arr.length; i++){
            arr[i] = (arr[i]).trim();
        }
        return arr;
    };

    Sensor.prototype._toString = function(value){
        if(!value) return null;
        return value + '';
    };

    Sensor.prototype._isStringArray = function(value){
        if(!(value instanceof Array))
            return false;
        for(var i = 0; i < value.length; i++){
            var s = value[i];
            if(typeof s !== 'string')
                return false;
        }
        return true;
    };

    Sensor.prototype.attr = function(nameOrConfig, value){

        if(this._multi){
            return this._multiAttr.apply(this, arguments);
        }

        if(arguments.length === 1){
            if(typeof nameOrConfig === 'string')
                return this._getAttr(nameOrConfig);
            else
                return this._setHashAttr(nameOrConfig);
        } else {
            return this._setAttr(nameOrConfig, value);
        }

    };

    Sensor.prototype._setMultiAttr = function(nameOrConfig, value){

        var i;
        var c = this._multi.length;
        var s;

        if(arguments.length === 1 && typeof nameOrConfig === 'object') {

            for (i = 0; i < c; i++) {
                s = this._multi[i];
                s._setHashAttr(nameOrConfig);
            }
            return this;

        } else {
            for (i = 0; i < c; i++) {
                s = this._multi[i];
                s._setAttr.apply(s, arguments);
            }
            return this;
        }

    };



    Sensor.prototype._multiAttr = function(nameOrConfig, value){

        var i;
        var result;
        var c = this._multi.length;
        var s;

        if(arguments.length === 1) {
            if (typeof nameOrConfig === 'string') {
                result = [];
                for (i = 0; i < c; i++) {
                    s = this._multi[i];
                    result.push(s._getAttr(nameOrConfig));
                }
                return result;
            } else {
                for (i = 0; i < c; i++) {
                    s = this._multi[i];
                    s._setHashAttr(nameOrConfig);
                }
                return this;
            }
        } else {
            for (i = 0; i < c; i++) {
                s = this._multi[i];
                s._setAttr(nameOrConfig, value);
            }
            return this;
        }

    };



    Sensor.prototype._getAttr = function(name){

        var c = sensor_config[name];
        if(!c)
            this.throwError('Sensor getter attribute [' + name + '] not found');

        return (c.getter) ? (this[c.getter]).call(this) : this[c.prop];

    };

    Sensor.prototype._setAttr = function(name, value){

        var c = sensor_config[name];

        if(!c)
            this.throwError('Sensor attribute [' + name + '] does not exist');

        if(c.method && c.no_arg && arguments.length > 1)
            this.throwError('Sensor method [' + name + '] takes no arguments');

        if(c.no_write)
            this.throwError('Sensor attribute [' + name + '] is read-only');

        if(arguments.length === 1)
            value = c.default_set;

        if(c.transform)
            value = (this[c.transform])(value);

        if(c.valid && !((this[c.valid])(value)))
            this.throwError('Sensor set attribute [' + name + '] value invalid: ' + value);

        if(typeof value !== 'function' && c.functor)
            value = createFunctor(value);

        if(c.type && value && c.type !== typeof value)
            this.throwError('Sensor set attribute [' + name + '] type mismatch: ' + value);

        if(c.options && c.options.indexOf(value) === -1)
            this.throwError('Sensor set attribute [' + name + '] value not among options: ' + value);

        if(c.setter)
            (this[c.setter]).call(this, value);
        else if(c.prop)
            this[c.prop] = value;

        return this;

    };

    Sensor.prototype._setHashAttr = function(config){

        for(var name in config){
            var value = config[name];
            this._setAttr(name, value);
        }

        return this;

    };

    Sensor.prototype._setScope = function(newScope){

        var oldScope = this._scope;
        if(oldScope)
            delete oldScope._sensors[this._id];
        this._scope = newScope;

        if(newScope)
            newScope._sensors[this._id] = this;

        return this;
    };

    Sensor.prototype._setHost = function(name) {

        var hosts = catbus._hosts;

        if(this._host && this._host._name != name){
            delete this._host._sensorMap[this._id];
            if(Object.keys(this._host._sensorMap).length == 0){
                delete hosts[this._host._name];
            }
        }

        if(!name) return this; // sensor removed from host when name is 'falsey'

        this._host = hosts[name] || (hosts[name] = new Host(name));
        this._host._sensorMap[this._id] = this;
        return this;

    };

    Sensor.prototype._setTopic = function(topic){

        topic = topic || 'update';

        var origCluster  = this._cluster;
        var data = origCluster._data;

        if(origCluster) // changing clusters with datas, leave the current one
            origCluster._remove(this);
        var newCluster = this._cluster = data._demandCluster(topic);
        newCluster._add(this);
        return this;

    };

    Sensor.prototype._setTrigger = function(triggers){

        // no triggers is equivalent to everything triggers
        // todo: array of acceptable tags or data locs to tags
        this._trigger = triggers || null;
        return this;

    };

    Sensor.prototype._setSync = function(){

        this._batch = false;
        this._keep = 'none';
        return this;

    };

    Sensor.prototype._setFirst = function(){

        this._batch = true;
        this._keep = 'first';
        return this;

    };

    Sensor.prototype._setLast = function(){

        this._batch = true;
        this._keep = 'last';
        return this;

    };

    Sensor.prototype._setAll = function(){

        this._batch = true;
        this._keep = 'all';
        return this;

    };


    Sensor.prototype._setBatch = function(batch){

        this._batch = batch;
        if(batch && !this._keep)
            this._keep = sensor_config.keep.default_set;
        return this;

    };

    Sensor.prototype.peek = function() {
        return this._cluster && this._cluster._lastEnvelope;
    };

    Sensor.prototype.look = Sensor.prototype.read = function() {
        var packet = this.peek();
        return (packet) ? packet.msg : undefined;
    };

    Sensor.prototype.auto = Sensor.prototype.autorun = function() {

        // todo sync CYCLE start
        var sensors = this._multi || [this];

        for(var i = 0; i < sensors.length; i++){
            var s = sensors[i];
            var packet = s.peek();
            if(packet) // && packet.msg != undefined)
                s.tell(packet.msg, packet.topic, s._getTag(), true); // was packet.tag -- breaks?
        }

        // todo sync CYCLE end

        return this;
    };

    Sensor.prototype._setData = function(data){

        if(data === (this._cluster && this._cluster._data)) return this; // matches current data

        var origCluster  = this._cluster;
        var origTopic = origCluster && origCluster._topic || 'update';

        if(origCluster) // changing clusters with datas, leave the current one
            origCluster._remove(this);

        var newCluster = this._cluster = data._demandCluster(origTopic);
        newCluster._add(this);

        return this;

    };


    // todo add 'add' sensor to multi, accept one or array or multi

    Sensor.prototype.merge = Sensor.prototype.next =function(mergeTopic) {

        mergeTopic = mergeTopic || 'update';

        var sensors = this._multi || [this];

        var mergeLoc = this._mergeLoc = this._scope.demandData('auto:' + (catbus.uid + 1));

        var mergeHost = this._host && this._host._name;
        var mergeContext = this._context;

        for(var i = 0; i < sensors.length; i++){
            var s = sensors[i];
            mergeHost = mergeHost || (s._host && s._host._name);
            mergeContext = mergeContext || s._context;
            s.pipe(mergeLoc);
        }
        var mergedSensor = mergeLoc.on(mergeTopic).host(mergeHost).as(mergeContext);
        return mergedSensor;

    };


    Sensor.prototype.drop = function(){

        if(this._dropped)
            return this;

        this._dropped = true;
        this._active = false;

        this.host(null);
        this.scope(null);

        if(this._cluster) {
            this._cluster._remove(this);
            this._cluster = null;
        }

        if(this._mergeLoc)
            this._mergeLoc.drop();



        return this;

    };

    Sensor.prototype.tell = function(msg, topic, tag, auto) {

        if(!this._active || this._dropped)
            return this;

        // todo change so gather watches but doesn't prime

        if(this._gather && this._gather.length > 0)
            msg = this._applyGathered(msg, topic, tag);

        msg = (this._extract) ? msg[this._extract] : msg;

        msg = (typeof this._appear === 'function') ? this._appear.call(this._context || this, msg, topic, tag) : msg;

        var compare_msg = this._change && this._change.call(null, msg, topic, tag);
        if(!auto && this._change && compare_msg === this._lastAppearingMsg)
            return this;

        this._lastAppearingMsg = compare_msg;

        if(!this._callback && !this._pipe)
            return this; // no actions to take

        if(this._filter && !this._filter.call(this._context || this, msg, topic, tag))
            return this; // message filtered out

        if (this._batch || this._group) { // create lists of messages grouped by tag and list in order
            var groupingTag = (this._group && this._group(msg, topic, tag)) || tag;
            var list = this._batchedByTag[groupingTag] = this._batchedByTag[groupingTag] || [];
            list.push(msg);
            this._batchedAsList.push(msg);
        } else {

            topic = (this._emit) ? this._emit.call(this._context || this, msg, topic, tag) : topic;
            msg = (this._transformMethod) ? this._transformMethod.call(this._context || this, msg, topic, tag) : msg;
            this._postcard = catbus.envelope(msg, topic, tag);

        }

        if(this._cancel && !this._cancel.call(this._context || this, msg, topic, tag)) {
            if(this._timeoutId)
                clearTimeout(this._timeoutId);
            this._timeoutId = null;
            this._primed = false;
            return; // message canceled
        }

        if(this._primed) return;

        // if all needs are not met, don't prime to send
        if((this._batch || this._group) && this._needs) {
            for(var i = 0; i < this._needs.length; i++){
                var need = this._needs[i];
                if(!this._batchedByTag.hasOwnProperty(need)) return; // a need unmet
            }
        }

        // don't prime a command unless we get a matching command tag
        if(!this._primed && this._cmd && this._cmd !== tag){
            return;
        }

        if(this._delay){
            if(!this._timeoutId){
                this._primed = true;
                this._timeoutId = setTimeout(this.send.bind(this), this._delay);
            }
            return; // timed, primes only through delay
        }

        this._primed = true;

        if (this._batch) {
            this._bus.queue(this);
        } else {
            this.send();
        }

    };

    Sensor.prototype._applyGathered = function(msg, topic, tag){

        // todo this is stupid not performant -- fix to one time lookup

        var consolidated = {};
        var scope = this._scope;


        var optional = this._optional; //todo add optional to sensor

        for(var i = 0; i < this._gather.length; i++){
            var name = this._gather[i];

            var data = scope._findData(name, 'first', optional);
            if(data){
                consolidated[name] = data.read();
            }
        }

        return consolidated;
    };

    Sensor.prototype._consolidateBatchByTag = function(){

        var consolidated = {};

        for(var tag in this._batchedByTag){

            var msgs = this._batchedByTag[tag];
            var keep = this._keep;

            if(keep === 'first'){
                consolidated[tag] = msgs[0];
            } else if(keep === 'last') {
                consolidated[tag] = msgs[msgs.length - 1];
            } else if(keep === 'all') {
                consolidated[tag] = msgs;
            }

        }

        if(!this._retain) this._batchedByTag = {};

        var msg = consolidated;
        var topic = this._getTopic();
        var tag = this._getTag();

        topic = (this._emit) ? this._emit.call(this._context || this, msg, topic , tag) : topic;
        msg = (this._transformMethod) ? this._transformMethod.call(this._context || this, msg, topic, tag) : msg;

        this._postcard = catbus.envelope(msg, topic, tag);

    };

    Sensor.prototype._consolidateBatchAsList = function(){

        var msg;
        var msgs = this._batchedAsList;
        var keep = this._keep;

        if(keep === 'first'){
            msg = msgs[0];
        } else if(keep === 'last') {
            msg = msgs[msgs.length - 1];
        } else if(keep === 'all') {
            msg = msgs;
        }

        var topic = this._getTopic();
        var tag = this._getTag();

        msg = (this._transformMethod) ? this._transformMethod.call(this._context || this, msg, topic, tag) : msg;
        topic = (this._emit) ? this._emit.call(this._context || this, msg, topic , tag) : topic;

        this._postcard = catbus.envelope(msg, topic, tag);

    };


    Sensor.prototype.send = function() {

        if(!this._active || this._dropped)
            return this; // dropped while batching?

        if(this._group && !this._gather) { // if gathering, hash already present
            this._consolidateBatchByTag();
        } else if (this._batch) {
            this._consolidateBatchAsList();
        }

        if(!this._retain) {
            this._batchedByTag = {};
            this._batchedAsList = [];
        }

        this._primed = false;

        var postcard = this._postcard;


        this._last = postcard;

        if(this._pipe){ // todo sync cycle check
            this._pipe.write(postcard.msg, postcard.topic, this._getTag(), this);
        } else {
            if(typeof (this._callback) !== 'function') return this;
            this._callback.call(this._context || this, postcard.msg, postcard.topic, this._getTag(), this);
        }

        if(this._max > 0)
            this._max--;
        if(this._max == 0)
            this.drop();

        return this;

    };


    var Data = function(name, dimension, ephemeral) {

        this._facade = false; //
        this._dimension = dimension || 'data';
        this._ephemeral = !!ephemeral;
        this._multi = null; // list of datas to put through api
        this._id = ++catbus.uid;
        this._name = name || ('auto:' + this._id);
        this._tag = name; // default
        this._clusters = {}; // by topic
        this._scope = null; // origin
        this._demandCluster('*'); // wildcard storage data for all topics
        this._demandCluster('update'); // default for data storage
        this._dropped = false;

    };




    Data.prototype.drop = Data.prototype.destroy = function(){

        if(this._dropped) return;

        for(var topic in this._clusters){
            var cluster = this._clusters[topic];
            cluster._drop();
        }

        this._dropped = true;

    };

    Data.prototype.tag = function(tag){
        if(arguments.length === 0) return this._tag;
        this._tag = tag;
        return this;
    };

    Data.prototype.name = function(){
        return this._name || null;
    };


    Data.prototype.createSensor = Data.prototype.on = Data.prototype.sensor = function(topicOrTopics){

        var topic_list;
        var loc_list;
        var sensor_list;
        var data;
        var topic;
        var sensor;

        topicOrTopics = topicOrTopics || 'update';
        topic_list = toNameArray(topicOrTopics);
        loc_list = this._multi || [this];

        if(loc_list.length === 1 && topic_list.length === 1){
            data = loc_list[0];
            topic = topic_list[0];
            sensor = data._createSensor().on(topic);
            return sensor;
        }

        sensor = this._createSensor();

        sensor_list = sensor._multi = [];

        for(var i = 0; i < loc_list.length; i++){
            data = loc_list[i];
            for(var j = 0; j < topic_list.length; j++){
                topic = topic_list[j];
                sensor_list.push(data._createSensor().on(topic));
            }
        }

        return sensor;

    };

    Data.prototype._createSensor = function(){
        var sensor = new Sensor();
        sensor.scope(this._scope);
        sensor._setData(this);
        return sensor;
    };

    Data.prototype._findCluster = function(topic){
        return this._clusters[topic];
    };

    Data.prototype._demandCluster = function(topic){
        if(typeof topic !== 'string'){
            throw new Error("Topic is not a string");
        }
        return this._findCluster(topic) || (this._clusters[topic] = new Cluster(topic, this));
    };

    Data.prototype.peek = function(topic){
        if(arguments.length == 0)
            topic = 'update';
        var cluster = this._findCluster(topic);
        if(!cluster)
            return undefined;
        return cluster._lastEnvelope;

    };

    // todo split internal data write vs public external to monitor 'fire' -- also add auto/fire check
    Data.prototype.read = Data.prototype.look = function(topic) {
        topic = topic || 'update';
        var packet = this.peek(topic);
        return (packet) ? packet.msg : undefined;
    };


    Data.prototype.write = function(msg, topic, tag){

        topic = topic || 'update';
        tag = tag || this.tag();

        this._demandCluster(topic);

        for(var t in this._clusters){
            if(t === "*" || t === topic){
                var cluster = this._clusters[t];
                cluster._tell(msg, topic, tag, fire);
            }
        }
    };

    Data.prototype.refresh = function(topic, tag){
        this.write(this.read(topic),topic, tag, true);
    };

    Data.prototype.toggle = function(topic, tag){
        this.write(!this.read(topic),topic, tag, true);
    };

    var selector = typeof jQuery !== 'undefined' && jQuery !== null ? jQuery : null;
    selector = selector || (typeof Zepto !== 'undefined' && Zepto !== null ? Zepto : null);
    if(selector)
        selector.fn.detect = catbus.$.detect;

    if ((typeof define !== "undefined" && define !== null) && (define.amd != null)) {
        define([], function() {
            return catbus;
        });
        this.catbus = catbus;
    } else if ((typeof module !== "undefined" && module !== null) && (module.exports != null)) {
        module.exports = catbus;
        catbus.catbus = catbus;
    } else {
        this.catbus = catbus;
    }




}).call(this);
