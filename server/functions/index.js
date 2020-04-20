const functions = require('firebase-functions');
const mExpress = require('express');
const mSocket = require('socket.io');
const kConst_PORT = process.env.PORT || 5000;

const kIceConfig = {
  iceServers: [
    {
      urls: 'stun:stun1.l.google.com:19302',
    },
    {
      urls: 'stun:stun2.l.google.com:19302',
    },
    {
      urls: 'turn:numb.viagenie.ca',
      credential: 'muazkh',
      username: 'webrtc@live.com',
    },
    {
      urls: 'turn:192.158.29.39:3478?transport=udp',
      credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
      username: '28224511:1379330808',
    },
    {
      urls: 'turn:192.158.29.39:3478?transport=tcp',
      credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
      username: '28224511:1379330808',
    },
    {
      urls: 'turn:turn.bistri.com:80',
      credential: 'homeo',
      username: 'homeo',
    },
    {
      urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
      credential: 'webrtc',
      username: 'webrtc',
    },
    // {
    //     urls: 'turn:numb.viagenie.ca?transport=tcp',
    //     credential: 'D0xfU4mW',
    //     username: 'android.prok@gmail.com'
    // }
    // {
    //     url: 'turn:numb.viagenie.ca',
    //     credential: 'muazkh',
    //     username: 'webrtc@live.com'
    // }

    // {
    //     urls: 'turn:numb.viagenie.ca',
    //     credential: '5B0qybBQwEJ',
    //     username: '3QeQ6BJT@productive-chat.com'
    // }
    // ,
    // {
    //     turn: '13.250.13.83:3478?transport=udp',
    //     username: "YzYNCouZM1mhqhmseWk6",
    //     credential: "YzYNCouZM1mhqhmseWk6"
    // }
  ],
};

const server = mExpress()
  .get('/', (request, response) => {
    response.send(`server time: ${Date.now()}`);
  })
  .listen(kConst_PORT, () => console.log(`Listening on ${kConst_PORT}`));
const funcInstnace = functions.https.onRequest(server);

const io = mSocket.listen(server);

let voiceVideo = io.of('/voice-video').on('connection', (socket) => {
  console.log('new connection:', socket.conn.id);
  socket.on('message', function (message) {
    console.log('message -> ', message);
    let room = socket.rooms[Object.keys(socket.rooms)[1]];
    socket.broadcast.to(room).emit('message', message);
  });
  socket.on('create or join', function (room) {
    let clientsInRoom = voiceVideo.adapter.rooms[room];
    let numClients =
      clientsInRoom === undefined
        ? 0
        : Object.keys(clientsInRoom.sockets).length;
    let returnObj = {
      room: room,
      config: kIceConfig,
    };

    if (numClients == 0) {
      socket.join(room, function () {
        socket.emit('created', returnObj);
      });
    } else if (numClients == 1) {
      socket.broadcast.to(room).emit('join', room);
      socket.join(room, function () {
        socket.emit('joined', returnObj);
      });
    }
  });
});

exports.gateway = funcInstnace;
