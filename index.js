const { io } = require('socket.io-client')
const enc = require('encdenc');
const rl = require('serverline');
rl.init();
const Machine = new enc();
const { v4 } = require('uuid');

const SERVER = process.argv[2] || 'http://localhost:3000';

const internals = [
    "/name",
    "/expose",
    '/whois',
    '/online',
    "/help",
    "/create",
    "/join",
    "/leave",
    "/kick",
    "/me"
]

let room = null;
let nameSet = false;
let name = 'default_name'
let verified = false;
let expose = true;

const Console = require('./helper/Console.js');
new Console()

const socket = io(SERVER);

function run() {
    rl.getRL().question("> ", msg => {
        if (msg.startsWith('/')) {
            if (msg.includes('=')) {
                const cmd = msg.split('=');
                if (cmd.length == 2) {
                    const cmdName = cmd[0].trim().toLowerCase();
                    const cmdResponse_RAW = cmd[1].trim();
                    const cmdResponse = cmd[1].trim().toLowerCase();
                    if (internals.includes(cmdName)) {
                        if (cmdName == '/name') {
                            nameSet = cmdResponse_RAW != 'default_name';
                            name = cmdResponse_RAW;
                            socket.emit('setName', Machine.encrypt(cmdResponse_RAW));
                            run();
                        }
                        if (cmdName == '/expose') {
                            if (cmdResponse == '0' || cmdResponse == '1') {
                                socket.emit('setExpose', Machine.encrypt(cmdResponse));
                                expose = cmdResponse == '1' ? true : false;
                                run();
                            } else socket.emit('msg-from-client', Machine.encrypt(msg), socket.id);
                        };
                        if (cmdName == '/whois') socket.emit('whois', cmdResponse_RAW);
                        if (cmdName == '/online') {
                            if (cmdResponse == 'id' || cmdResponse == 'name') socket.emit(
                                'online', Machine.encrypt(cmdResponse), room ? true : false, room ? Machine.encrypt(room.id) : null
                            );
                            else socket.emit('msg-from-client', Machine.encrypt(msg), socket.id);
                        };
                        if (cmdName == '/create') {
                            if (!room) {
                                const responseArray = cmdResponse.split('/'); // total_members/show(id or name)
                                if (responseArray.length == 2) {
                                    const [max, show] = responseArray;
                                    if ((!isNaN(max)) && ['id', 'name'].includes(show)) {
                                        if (show == 'name' && !nameSet) {
                                            console.log("[for 'name' type room, /name should be defined]");
                                            run();
                                            return;
                                        };
                                        room = {
                                            id: v4(), max, show,
                                            joinee: socket.id,
                                            host: socket.id
                                        };
                                        let roomData = Machine.encrypt(JSON.stringify(room));
                                        socket.emit('join-room', roomData);
                                    } else socket.emit('msg-from-client', Machine.encrypt(msg), socket.id);
                                } else socket.emit('msg-from-client', Machine.encrypt(msg), socket.id);
                            } else {
                                console.log('[already in a room]');
                                run();
                            }
                        };
                        if (cmdName == '/join') {
                            if (!room) {
                                room = {
                                    id: cmdResponse_RAW, nameSet
                                };
                                const roomData = Machine.encrypt(JSON.stringify(room));
                                socket.emit('join-room', roomData);
                            } else {
                                console.log('[already in a room]');
                                run();
                            }
                        };
                        if (cmdName == '/leave') {
                            if (room) socket.emit('leave-room');
                            else socket.emit('msg-from-client', Machine.encrypt(msg), socket.id);
                        }
                        if (cmdName == '/kick') {
                            if (room && room.host) {
                                if (cmdResponse_RAW != socket.id) socket.emit('kick-user', Machine.encrypt(cmdResponse_RAW));
                                else {
                                    console.log("[CAN'T KICK YOURSELF]");
                                    run();
                                }
                            }
                            else socket.emit('msg-from-client', Machine.encrypt(msg + (room && !room.host ? ' [ONLY HOST]' : '')), socket.id);
                        }
                        if (cmdName == '/me') {
                            console.log(`Data:\nid: ${socket.id}\nname: ${name}\nexposed: ${expose ? 'yes' : 'no'}\nroom: ${room ? room.id : 'global'}`);
                            run();
                        }
                        if (cmdName == '/help') {
                            let help = "Commands:\n/name=user_name (set name)\n/expose=0|1 (hide/show name)\n/whois=user_id (find by id)\n/online=id|name\n/create={max_mem}/{show_type(id|name)} (prvt room, show your name or id there)\n/join=room_id (join room)\n/kick=user_id (only for host, kick user)\n/leave= (leave room)\n/me= (your data)"
                            console.log(help);
                            run();
                        }
                    } else socket.emit('msg-from-client', Machine.encrypt(msg), socket.id);
                } else socket.emit('msg-from-client', Machine.encrypt(msg), socket.id);
            } else socket.emit('msg-from-client', Machine.encrypt(msg), socket.id);
        } else socket.emit('msg-from-client', Machine.encrypt(msg), socket.id);
    });
}

socket.on('verify', () => {
    rl.getRL().question("Welcome to Curl Chat!\n/help => see inbuilt commands\n\npress enter to continue...", _ => {
        verified = true;
        socket.emit('verified')
    });
})

socket.on('connected', (id, password) => {
    if (room || !verified) return;
    console.log(`[${id}${socket.id == id ? '-you connectced]' : ' connected]'}`);
    password = JSON.parse(password);
    Machine.config = password;
    if (socket.id == id) run();
});

socket.on('msg-from-server', (msg, from, scope, showType, fromName) => {
    msg = Machine.decrypt(msg);
    if (from != socket.id) {
        if (scope == 'global' || showType == 'id') {
            if (room && scope == 'global') return;
            console.log(`[${from}]: ${msg}`);
        }
        if (showType == 'name') console.log(`[${Machine.decrypt(fromName)}(${from.substr(0, 4)}...)]: ${msg}`);
    }
    if (from == socket.id) run();
});

socket.on('user-found', (username, id) => {
    username = Machine.decrypt(username);
    console.log(`[${id}: ${username}]`);
    run();
})

socket.on('online-found', (list, total) => {
    list = Machine.decrypt(list);
    total = Machine.decrypt(total);
    console.log(`(${total})[${list}]`);
    run();
})

socket.on('room-join', (id, showType, username) => {
    username = Machine.decrypt(username);
    console.log(`[${id}${showType == 'name' ? `(${username})` : ""} joined room: ${room.id}]`);
    if (id == socket.id) run();
});

socket.on('room-join-fail', err => {
    console.log(`[${err}]`);
    room = null;
    run();
})

socket.on('user-left', (id) => {
    if (room) return;
    console.log(`[${id} left]`);
    if (socket.id == id) run();
});

socket.on('host-left-room', () => {
    room = null;
    console.log('[HOST LEFT-NOW GLOBAL]');
    run();
});

socket.on('member-left-room', (userId, name) => {
    name = Machine.decrypt(name);
    console.log(`[${userId}(${name}) LEFT]`);
    if (socket.id == userId) run();
})

socket.on('you-left-room', (kick) => {
    room = null;
    console.log(kick ? '[KICKED BY HOST-NOW GLOBAL]' : '[ROOM LEFT-NOW GLOBAL]');
    run();
})

socket.on('set-name-fail', err => {
    console.log(err);
    nameSet = true;
    run();
});

socket.on('kick-fail', err => {
    console.log(err);
    run();
})
socket.on('kick-from-client', userId => {
    if (socket.id == userId) socket.emit('leave-room', 'kick-me');
})
