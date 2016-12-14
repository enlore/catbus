/**
 * catbus.js (v4.0.0) --
 *
 * Copyright (c) 2016 Scott Southworth
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
 * @authors Scott Southworth @darkmarmot
 *
 */

;(function(){

    // todo when frame added, assign to bus wrapper adding it -- bus destroys only own frames
    "use strict";

    var Catbus = {};
    
    function createFunctor(val) {
        return (typeof val === 'function') ? val : function() { return val; };
    }
    
    Catbus.uid = 0;
    Catbus.primed = false;




    var TIMER_METHOD = 'timerMethod';

    var batchQueue = []; // for all batching

    Catbus.flush = function(){

        this._primed = false;
        
        var cycles = 0;

        var q = batchQueue;
        batchQueue = [];

        while(q.length) {

            while (q.length) {
                var stream = q.shift();
                stream.fireContent();
            }

            q = batchQueue;
            batchQueue = [];

            cycles++;
            if(cycles > 10)
                throw new Error('Batch cycling loop > 10.', q);

        }

    };


    var BATCH_TIMER =  function(stream){
        batchQueue.push(stream || this);
    };

    var DEFER_TIMER = function(){
        setTimeout(this.fireContent, 0);
    };

    function SKIP_DUPES_FILTER(msg, source, last){
        return msg !== (last && last.msg);
    }

    var CLEAR_ALL = function(){
        if(this.groupMethod)
            this.messagesByKey = {};
        else
            this.messages = [];
    };

    var CLEAR_GROUP = function(){
        var messagesByKey = this.messagesByKey;
        for(var k in messagesByKey){
            messagesByKey[k] = [];
        }
    };

    var TRUE_FUNC = function(){ return true;};
    var FALSE_FUNC = function(){ return false;};
    var TO_SOURCE_FUNC = function(msg, source){ return source;};
    var TO_MSG_FUNC = function(msg, source){ return msg;};

    var KEEP_LAST = function(buffer, msg, n){

        if(n === 0){
            if(buffer.length === 0)
                buffer.push(msg);
            else
              buffer[0] = msg;
            return buffer;
        }

        buffer.push(msg);

        if(buffer.length > n)
            buffer.shift();

        return buffer;

    };


    var KEEP_FIRST = function(buffer, msg, n){

        if(buffer.length < n || buffer.length === 0)
            buffer.push(msg);

        return buffer;

    };

    var KEEP_ALL = function(buffer, msg){

        buffer.push(msg);
        return buffer;

    };

// todo group first, then keep, then batch // if schedule then will add frame

    var Frame = function(){

        this.bus = null;
        this.streams = [];
        this.index = 0;
        this._holding = false; //begins group, keep, schedule frame

    };

    Frame.prototype.run = function(method){

        if(this._holding)
            throw new Error('Sensor.frame.transform cannot be invoked while holding.');

        this.modifyFrame('runMethod', method);
        this.modifyFrame('processName', 'doRun');

        return this;

    };


    Frame.prototype.hold = function(){

        this._holding = true;
        this.modifyFrame('processName', 'doHold');

        return this;

    };

    Frame.prototype.transform = function(method){

        if(this._holding)
            throw new Error('Sensor.frame.transform cannot be invoked while holding.');

        if(arguments.length === 0)
            throw new Error('Sensor.frame.transform requires one argument.');

        method = createFunctor(method);

        this.modifyFrame('processName', 'doTransform');
        this.modifyFrame('transformMethod', method);
        return this;

    };


    Frame.prototype.name = function(method){

        if(this._holding)
            throw new Error('Sensor.frame.name cannot be invoked while holding.');

        if(arguments.length === 0)
            throw new Error('Sensor.frame.name requires one argument.');

        method = createFunctor(method);

        this.modifyFrame('processName', 'doName');
        this.modifyFrame('nameMethod', method);

        return this;


    };

    Frame.prototype.delay = function(funcOrNum){

        //if(this._holding)
        //    throw new Error('Sensor.frame.delay cannot be invoked while holding.');

        if(arguments.length === 0)
            throw new Error('Sensor.frame.delay requires one argument.');

        var func = createFunctor(funcOrNum);

        this.modifyFrame('delayMethod', func);

        this.modifyFrame('processName', 'doDelay');
        return this;

    };

    //Frame.prototype.throttle = function(options){
    //
    //    if(arguments.length === 0)
    //        throw new Error('Sensor.frame.delay requires an options argument.');
    //
    //    this.modifyFrame(DELAY_METHOD, method);
    //    this.modifyFrame('processName', 'doDelay');
    //    return frame;
    //
    //};

    Frame.prototype.filter = function(func){

        if(this._holding)
            throw new Error('Sensor.frame.filter cannot be invoked with hold().');

        if(arguments.length === 0 || typeof func !== 'function')
            throw new Error('Sensor.frame.filter requires one function argument.');

        this.modifyFrame('filterMethod', func);
        this.modifyFrame('processName', 'doFilter');

        return this;
    };

    Frame.prototype.skipDupes = function(){

        return this.filter(SKIP_DUPES_FILTER);

    };

    Frame.prototype.group = function(func){

        this._holding = true;

        func = arguments.length === 1 ? createFunctor(func) : TO_SOURCE_FUNC;

        this.modifyFrame('processName', 'doGroup');
        this.modifyFrame('groupMethod', func);
        this.modifyFrame('messagesByKey', {});

        return this;

    };


    Frame.prototype.last = function(n){

        n = Number(n) || 0;

        this.modifyFrame('keepMethod', KEEP_LAST);
        this.modifyFrame('keepCount', n);
        if(!this._holding)
            this.modifyFrame('processName', 'doKeep');

        return this;

    };

    Frame.prototype.first = function(n){

        n = Number(n) || 0;
        this.modifyFrame('keepMethod', KEEP_FIRST);
        this.modifyFrame('keepCount', n);
        if(!this._holding)
            this.modifyFrame('processName', 'doKeep');

        return this;

    };


    Frame.prototype.all = function(){

        this.modifyFrame('keepMethod', KEEP_ALL);
        this.modifyFrame('keepCount', -1);
        if(!this._holding)
            this.modifyFrame('processName', 'doKeep');

        return this;

    };

    Frame.prototype.batch = function(){

        this.modifyFrame(TIMER_METHOD, BATCH_TIMER);
        return this;

    };

    Frame.prototype.ready = function(method){

        if(arguments.length === 0 || typeof method !== 'function')
            throw new Error('Sensor.frame.ready requires one function argument.');

        if(!this.scheduleMethod)
            throw new Error('Sensor.frame.ready requires a schedule (batch, defer, throttle, delay)');

        return this.modifyFrame(READY_METHOD, method);

    };


    function createEventStream(target, eventName, useCapture){

        useCapture = !!useCapture;

        var stream = new Stream();
        stream.name = eventName;

        var on = target.addEventListener || target.addListener || target.on;
        var off = target.removeEventListener || target.removeListener || target.off;

        var streamForward = function(msg){
            stream.tell(msg, eventName);
        };

        stream.cleanupMethod = function(){
            off.call(target, eventName, streamForward, useCapture);
        };

        on.call(target, eventName, streamForward, useCapture);

        return stream;
    }

    Frame.prototype.addEvent = function(target, eventName, useCapture) {

        var stream = createEventStream(target, eventName, useCapture);
        // todo register off callback
        
        var nextFrame = this.addFrame();
        nextFrame.streams.push(stream);

        return nextFrame;
    };

    Frame.prototype.destroy = function(){
        var streams = this.streams;
        var len = streams.length;
        for(var i = 0; i < len; i++){
            streams[i].cleanupMethod();
        }
        this.streams = null;
    };

    // like addFrame but doesn't connect via frames to the prior frame, acting as the init frame of a new bus





// create a new frame with matching empty streams fed by the current frame

    Frame.prototype.modifyFrame = function(prop, val){


        var streams = this.streams;
        var len = streams.length;

        for(var i = 0; i < len; i++){

            var stream = streams[i];
            stream[prop] = val;

        }

        return this;

    };


    

    var NOOP = function(){};

    function Stream(){

        this.dead = false;
        this.children = []; // streams listening or subscribed to this one
        this.lastPacket = null;
        this.name = null;
        this.cleanupMethod = NOOP; // to cleanup subscriptions

        this.messages = []; // [] with hold
        this.messagesByKey = null; // {} with group

        this.processName = 'doPass'; // default to pass things along last thing unchanged
        this.keepMethod = KEEP_LAST; // default if holding or grouping
        this.keepCount = 0; // non-zero creates an array

        this.timerMethod = null; // throttle, debounce, defer, batch
        this.groupMethod = null;
        this.runMethod = null;
        this.transformMethod = null;
        this.filterMethod = null;
        this.nameMethod = null;
        this.delayMethod = null;

        this.readyMethod = TRUE_FUNC;
        this.clearMethod = TRUE_FUNC; // return true/false for latched
        this.latched = false; // from this.clearMethod()

        this.primed = false;

    }

    Stream.prototype.destroy = function(){

        if(this.dead)
            return;

        this.cleanupMethod(); // should remove an eventListener if present

    };

    Stream.prototype.flowsTo = function(stream){
        this.children.push(stream);
    };

    Stream.prototype.drop = function(stream){

        var i = this.children.indexOf(stream);

        if(i !== -1)
            this.children.splice(i, 1);

    };


    Stream.prototype.tell = function(msg, source) {

        if(this.dead) // true if canceled or disposed midstream
            return this;

        //console.log('stream gets:', msg);

        var last = this.lastPacket;
        source = this.name || source; // named streams (usually initial feeds) always pass their name forward

        // tell method = doDelay, doGroup, doHold, tellTransform, doFilter
        var processMethod = this[this.processName];
        processMethod.call(this, msg, source, last);

        return this;


    };


    Stream.prototype.flowForward = function(msg, source, thisStream){

        thisStream = thisStream || this; // allow callbacks with context instead of bind (massively faster)
        thisStream.lastPacket = new Packet(msg, source);


        var children = thisStream.children;
        var len = children.length;

        for(var i = 0; i < len; i++){
            var c = children[i];
            c.tell(msg, source);
        }

    };
    Stream.prototype.doPass = function(msg, source) {

        this.flowForward(msg, source);

    };

    Stream.prototype.doFilter = function(msg, source) {

        if(!this.filterMethod(msg, source, this.lastPacket))
            return;

        this.flowForward(msg, source);

    };

    // synchronous keep

    Stream.prototype.resolveKeep = function(){
        return this.keepCount === 0 ? this.messages[0] : this.messages;
    };



    Stream.prototype.doKeep = function(msg, source) {

        this.keepMethod(this.messages, msg, this.keepCount);
        msg = this.resolveKeep();
        this.flowForward(msg, source);

    };


    Stream.prototype.doDelay = function(msg, source) {

        // passes nextStream as 'this' to avoid bind slowdown

        setTimeout(this.flowForward, this.delayMethod() || 0, msg, source, this);

    };

    Stream.prototype.tellBatch = function(msg, source) {

        // passes nextStream as 'this' to avoid bind slowdown
        setTimeout(this.tell, this.delayMethod() || 0, msg, source, this.nextStream);

    };

    Stream.prototype.tellThrottle = function(msg, source) {

        var nextStream = this.nextStream;
        setTimeout(nextStream.tell.bind(nextStream), this.delayMethod() || 0, msg, source);

    };

    Stream.prototype.tellDebounce = function(msg, source) {

        var nextStream = this.nextStream;
        setTimeout(nextStream.tell.bind(nextStream), this.delayMethod() || 0, msg, source);

    };


    Stream.prototype.doTransform = function(msg, source, last) {

        msg = this.transformMethod(msg, source, last);
        this.flowForward(msg, source);

    };

    Stream.prototype.doName = function(msg, source, last) {

        source = this.nameMethod(msg, source, last);
        this.flowForward(msg, source);

    };

    Stream.prototype.doRun = function(msg, source, last) {

        this.runMethod(msg, source, last);
        this.flowForward(msg, source);

    };


    Stream.prototype.doGroup = function(msg, source, last) {

        var groupName = this.groupMethod(msg, source, last);

        var messages = this.messagesByKey[groupName] = this.messagesByKey[groupName] || [];
        this.keepMethod(messages, msg, this.keepCount);

        if(!this.primed && (this.latched || this.readyMethod(this.messagesByKey, last))) {
            if(this.timerMethod) {
                this.primed = true;
                this.timerMethod(); // should call back this.fireContent
            } else {
                this.fireContent();
            }
        }

    };

    Stream.prototype.doHold = function(msg, source, last) {

        this.keepMethod(this.messages, msg, this.keepCount);

        if(!this.primed && (this.latched || this.readyMethod(this.messages, last))) {
            if(this.timerMethod) {
                this.primed = true;
                this.timerMethod(); // should call back this.fireContent
            } else {
                this.fireContent();
            }
        }

    };

    Stream.prototype.releaseHold = function() {

        var msg = this.resolveKeep();
        this.latched = this.clearMethod(); // might be noop, might hold latch
        this.primed = false;

        this.flowForward(msg);

    };

    Stream.prototype.fireContent = function() {

        var msg = this.groupMethod ? this.resolveKeepByGroup() : this.resolveKeep();

        this.latched = this.clearMethod(); // might be noop, might hold latch
        this.primed = false;

        this.flowForward(msg);

    };

    Stream.prototype.resolveKeepByGroup = function(){

        var messagesByKey = this.messagesByKey;
        for(var k in messagesByKey){
            messagesByKey[k] = this.resolveKeep(messagesByKey[k]);
        }
        return messagesByKey;

    };


    var Packet = function(msg, source){

        this.msg = msg;
        this.source = source;
        this.timestamp = Date.now();

    };

    Catbus.fromEvent = function(target, eventName, useCapture){

        var stream = createEventStream(target, eventName, useCapture);
        return Catbus.fromStream(stream);

    };

    Catbus.fromStream = function(stream){

        var bus = new Bus();
        var frame = new Frame();
        frame.streams.push(stream);
        frame.bus = bus;
        bus.frames.push(frame);
        return bus;

    };

    var Bus = function() {

        this.frames = [];
        this.dead = false;

    };

    Bus.prototype.currentFrame = function(){
        var frames = this.frames;
        var len = frames.length;
        return frames[len-1];
    };

    Bus.prototype.addFrame = function(){

        var frames = this.frames;
        var len = frames.length;
        var currentFrame = frames[len-1];
        var nextFrame = new Frame();
        nextFrame.index = len;
        nextFrame.bus = this;
        frames.push(nextFrame);

        this._wireFrames(currentFrame, nextFrame);

        return nextFrame;
    };

    // create a new frame with one stream fed by all streams of the current frame

    Bus.prototype.merge = function(){

        var sourceFrame = this.frames[this.frames.length-1];
        var mergeFrame = new Frame();
        var streams = sourceFrame.streams;
        
        var mergeStream = new Stream();
        mergeFrame.streams = [mergeStream];

        for(var i = 0; i < streams; i++){

            var s = streams[i];
            s.flowsTo(mergeStream);

        }

        return this;

    };
    

    Bus.prototype.fork = function(){

        var frames = this.frames;
        var len = frames.length;
        var currentFrame = frames[len-1];

        var forkFrame = new Frame();
        forkFrame.index = 0;
        var forkBus = forkFrame.bus = new Bus();
        forkBus.frames.push(forkFrame);

        this._wireFrames(currentFrame, forkFrame);

        return forkBus;
    };



    // send messages from streams in one frame to new empty streams in another frame

    Bus.prototype._wireFrames = function(frame1, frame2){

        var streams1 = frame1.streams;
        var len = streams1.length;
        var streams2 = frame2.streams;

        for(var i = 0; i < len; i++){

            var s1 = streams1[i];
            var s2 = new Stream();
            streams2.push(s2);
            s1.flowsTo(s2);

        }

    };

    Bus.prototype.defer = function(){
        var currentFrame = this.currentFrame();
        this._holding ? currentFrame.delay(0) : this.addFrame().delay(0);
        return this;
    };

    Bus.prototype.batch = function(){
        var currentFrame = this.currentFrame();
        this._holding ? currentFrame.batch() : this.addFrame().batch();
        return this;
    };


    Bus.prototype.hold = function(){
        this._holding = true;
        this.addFrame().hold();
        return this;
    };

    Bus.prototype.delay = function(num){
        this.addFrame().delay(num);
        return this;
    };


    Bus.prototype.all = function(){
        this.addFrame().all();
        return this;
    };

    Bus.prototype.first = function(n){
        this.addFrame().first(n);
        return this;
    };

    Bus.prototype.last = function(n){
        var currentFrame = this.currentFrame();
        this._holding ? currentFrame.last(n) : this.addFrame().last(n);
        //this.addFrame().last(n);
        return this;
    };

    Bus.prototype.run = function(func){
        this.addFrame().run(func);
        return this;
    };

    Bus.prototype.transform = function(func){
        this.addFrame().transform(func);
        return this;
    };

    Bus.prototype.filter = function(func){
        this.addFrame().filter(func);
        return this;
    };

    Bus.prototype.skipDupes = function(func){
        this.addFrame().filter(SKIP_DUPES_FILTER);
        return this;
    };


    //Bus.fromEvent();
    //Bus.fromTimer();


    Bus.prototype.destroy = function(){

        if(this.dead)
            return this;

        this.dead = true;

        var frames = this.frames;
        var len = frames.length;

        for(var i = 0; i < len; i++){
            var f = frames[i];
            f.destroy();
        }

        return this;

    };


    var plugins = typeof seele !== 'undefined' && seele;
    if(plugins)
        plugins.register('catbus', Catbus, true);

    
    if ((typeof define !== "undefined" && define !== null) && (define.amd != null)) {
        define([], function() {
            return catbus;
        });
        this.Catbus = Catbus;
    } else if ((typeof module !== "undefined" && module !== null) && (module.exports != null)) {
        module.exports = Catbus;
    } else {
        this.Catbus = Catbus;
    }




}).call(this);
