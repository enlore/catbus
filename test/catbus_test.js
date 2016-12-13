//run mocha from project root

var events = require('events');


var dice = new events.EventEmitter();

var assert = require('assert');
var Catbus = require('../src/catbus.js');


var msgLog, sourceLog, packetLog;


var log = function(msg, source, packet){

    msgLog.push(msg);
    sourceLog.push(source);
    packetLog.push(packet);

};


var reset = function(){

    sourceLog = [];
    msgLog = [];
    packetLog = [];

};

reset();
//
//
//var b = Catbus.fromEvent(emitter, 'boo');
//b.transform(function(msg){ return msg + '-cat';});
//b.run(log);


describe('Catbus', function(){

    describe('Bus', function(){




        describe('basic sync flow', function() {


            beforeEach(reset);

            it('creates an event bus', function () {

                var b = Catbus.fromEvent(dice, 'roll');
                b.run(log);

                dice.emit('roll', 5);
                dice.emit('roll', 3);
                dice.emit('drop', 1);
                dice.emit('roll', 0);

                b.destroy();

                assert.equal(msgLog.length, 3);
                assert.equal(msgLog[1], 3);
                assert.equal(msgLog[2], 0);
                assert.equal(sourceLog[2], 'roll');

            });

            it('destroys an event bus', function () {

                var b = Catbus.fromEvent(dice, 'roll');
                b.run(log);

                dice.emit('roll', 5);

                b.destroy();

                dice.emit('roll', 3);
                dice.emit('drop', 1);
                dice.emit('roll', 0);


                assert.equal(msgLog.length, 1);
                assert.equal(msgLog[0], 5);

            });


            it('transforms messages', function () {

                reset();

                var b = Catbus.fromEvent(dice, 'roll');
                b.transform(function(msg){ return msg * 2});
                b.run(log);

                dice.emit('roll', 5);
                dice.emit('roll', 3);
                dice.emit('drop', 1);
                dice.emit('roll', 0);

                b.destroy();

                assert.equal(msgLog.length, 3);
                assert.equal(msgLog[1], 6);
                assert.equal(msgLog[2], 0);
                assert.equal(sourceLog[2], 'roll');

            });

            it('filters messages', function () {

                reset();

                var b = Catbus.fromEvent(dice, 'roll');
                b.transform(function(msg){ return msg * 2});
                b.filter(function(msg){ return msg < 6});
                b.run(log);

                dice.emit('roll', 5);
                dice.emit('roll', 3);
                dice.emit('drop', 1);
                dice.emit('roll', 0);
                dice.emit('roll', 2);

                b.destroy();

                assert.equal(msgLog.length, 2);
                assert.equal(msgLog[0], 0);
                assert.equal(msgLog[1], 4);
                assert.equal(sourceLog[1], 'roll');

            });

            it('can skip duplicate messages', function () {

                reset();

                var b = Catbus.fromEvent(dice, 'roll');
                b.transform(function(msg){ return msg * 2});
                b.skipDupes();
                b.run(log);

                dice.emit('roll', 5);
                dice.emit('drop', 1);
                dice.emit('roll', 5);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 5);

                b.destroy();

                assert.equal(msgLog.length, 3);
                assert.equal(msgLog[0], 10);
                assert.equal(msgLog[1], 6);
                assert.equal(msgLog[2], 10);
                assert.equal(sourceLog[1], 'roll');

            });

            it('can keep multiple messages using last', function () {

                reset();

                var b = Catbus.fromEvent(dice, 'roll');
                b.transform(function(msg){ return msg * 2});
                b.last(3);
                b.run(log);

                dice.emit('roll', 5);
                dice.emit('drop', 1);
                dice.emit('roll', 5);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 7);

                b.destroy();

                var lastMsg = msgLog[msgLog.length-1];

                assert.equal(lastMsg.length, 3);
                assert.equal(lastMsg[2], 14);


            });

            it('can keep multiple messages using first', function () {

                reset();

                var b = Catbus.fromEvent(dice, 'roll');
                b.transform(function(msg){ return msg * 2});
                b.first(2);
                b.run(log);

                dice.emit('roll', 5);
                dice.emit('drop', 1);
                dice.emit('roll', 4);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 7);

                b.destroy();

                var lastMsg = msgLog[msgLog.length-1];

                assert.equal(lastMsg.length, 2);
                assert.equal(lastMsg[1], 8);


            });

            it('can keep all messages using all', function () {

                reset();

                var b = Catbus.fromEvent(dice, 'roll');
                b.transform(function(msg){ return msg * 2});
                b.all();
                b.run(log);

                dice.emit('roll', 5);
                dice.emit('drop', 1);
                dice.emit('roll', 4);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 7);

                b.destroy();

                var lastMsg = msgLog[msgLog.length-1];

                assert.equal(lastMsg.length, 6);
                assert.equal(lastMsg[5], 14);


            });

            it('can delay messages', function (done) {

                reset();
                this.timeout(1000);

                var b = Catbus.fromEvent(dice, 'roll');
                b.transform(function(msg){ return msg * 2});
                b.delay(100);
                b.run(log);

                dice.emit('roll', 5);
                dice.emit('drop', 1);
                dice.emit('roll', 4);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 3);
                dice.emit('roll', 7);

                assert.equal(msgLog.length, 0);

                function assertLater(){

                    assert.equal(msgLog[0], 10);
                    assert.equal(msgLog[5], 14);

                }

                setTimeout(function(){
                    b.destroy();
                    assertLater();
                    done();
                }, 200);






            });


        });

        // todo activate/deactivate bus


        describe('batching', function() {

            function floodCastle(){
                castle.write('Mononoke');
                castle.write('Ashitaka');
                castle.write('San');
            }

            function floodWorld(){
                castle.write('Ponyo','update','fish');
                castle.write('Nausicaa', 'update', 'spores');
                castle.write('Yupa', 'update', 'spores');
            }

            function floodCastleTopics(){
                castle.write('Asbel', 'ring');
                castle.write('Teto', 'rodent');
                castle.write('Jihl', 'sword');
            }

            beforeEach(function(){
                _reset();
                girl = castle.on().batch().run(_callback);
            });

            afterEach(function(){
                girl.drop();
            });

            it('avoids callback from batch until flush', function () {

                floodCastle();
                assert.equal(0, _invoked);
                bus.flush();

            });

            it('runs callback from batch after flush, last message default', function () {

                floodCastle();
                bus.flush();
                assert.equal(1, _invoked);
                assert.equal('San', _msg);

            });

            it('batch keeps first message', function () {

                //girl.keep('first');
                girl.first();
                floodCastle();
                bus.flush();
                assert.equal(1, _invoked);
                assert.equal('Mononoke', _msg);

            });

            it('batch keeps all messages', function () {

                //girl.keep('all');
                girl.all();
                floodCastle();
                bus.flush();
                assert.equal(1, _invoked);
                assert.equal(3, _msg.length);

            });

            it('batches all and sets emit topics', function () {

                //girl.keep('all').emit(function(msg){ return 'count is ' + msg.length;});
                girl.all().emit(function(msg){ return 'count is ' + msg.length;});

                floodCastle();
                bus.flush();
                assert.equal(1, _invoked);
                assert.equal(3, _msg.length);
                assert.equal('count is 3', _topic);
            });

            it('batch into groups with emit topics', function () {

                girl.group().emit(function(msg){ return 'fish is ' + msg.fish;});
                floodCastle();
                floodWorld();
                bus.flush();
                assert.equal(1, _invoked);
                assert.equal('San', _msg.castle);
                assert.equal('Ponyo', _msg.fish);
                assert.equal('Yupa', _msg.spores);
                assert.equal('fish is Ponyo', _topic);

            });

            it('batch into groups of messages by tag, last per tag default', function () {

                girl.group();
                floodCastle();
                floodWorld();
                bus.flush();
                assert.equal(1, _invoked);
                assert.equal('San', _msg.castle);
                assert.equal('Ponyo', _msg.fish);
                assert.equal('Yupa', _msg.spores);

            });


            it('batch into groups of messages by tag, last per tag default -- grouped by topic', function () {

                girl.on('*').group(function(msg, topic, name){ return topic;});
                floodCastleTopics();
                floodWorld();
                bus.flush();
                assert.equal(1, _invoked);
                assert.equal('Asbel', _msg.ring);
                assert.equal('Yupa', _msg.update);

            });

            it('batch into groups of messages by tag, first per tag', function () {

                girl.group().keep('first');
                floodCastle();
                floodWorld();
                bus.flush();
                assert.equal(1, _invoked);
                assert.equal('Mononoke', _msg.castle);
                assert.equal('Ponyo', _msg.fish);
                assert.equal('Nausicaa', _msg.spores);

            });

            it('batch into groups of messages by tag, lists of all received', function () {

                girl.group().keep('all');
                floodCastle();
                floodWorld();
                bus.flush();
                assert.equal(1, _invoked);
                assert.equal(3, _msg.castle.length);
                assert.equal(1, _msg.fish.length);
                assert.equal(2, _msg.spores.length);

            });

            it('batch into groups of messages by tag, retain last across flushes', function () {

                girl.group().retain(); // keep('last') is default
                floodCastle();
                bus.flush();
                floodWorld();
                bus.flush();
                assert.equal(2, _invoked);
                assert.equal('San', _msg.castle);
                assert.equal('Ponyo', _msg.fish);
                assert.equal('Yupa', _msg.spores);

            });

            it('batch into groups of messages by tag, retain first across flushes', function () {

                girl.group().retain().keep('first');
                floodCastle();
                bus.flush();
                floodWorld();
                bus.flush();
                //console.log('CHECK',_msg);
                assert.equal(2, _invoked);
                assert.equal('Mononoke', _msg.castle);
                assert.equal('Ponyo', _msg.fish);
                assert.equal('Nausicaa', _msg.spores);

            });

            it('batch into groups of messages by tag, retain all across flushes', function () {

                girl.group().retain().keep('all');
                floodCastle();
                bus.flush();
                floodWorld();
                floodCastle();
                bus.flush();

                assert.equal(2, _invoked);
                assert.equal(6, _msg.castle.length);
                assert.equal(1, _msg.fish.length);
                assert.equal(2, _msg.spores.length);

            });

            it('batch only after needs fulfilled', function () {

                girl.group().keep('first').need(['fish','spores']);
                floodCastle();
                bus.flush();
                assert.equal(0, _invoked);
                floodWorld();
                bus.flush();
                assert.equal(1, _invoked);
                floodCastle();
                bus.flush(); // does not send again
                assert.equal(1, _invoked);


            });


            it('batch repeatedly after needs are retained', function () {

                girl.group().retain().keep('first').need(['fish','spores']);
                floodCastle();
                floodWorld();
                bus.flush();
                assert.equal(1, _invoked);
                girl.keep('last');
                floodCastle();
                bus.flush(); // does send again since needs were retained
                assert.equal(2, _invoked);
                bus.flush(); // but not again without additional messages
                assert.equal(2, _invoked);
                floodCastle();
                bus.flush(); // and one more again for good measure
                assert.equal(3, _invoked);

            });

        });



    });


});


