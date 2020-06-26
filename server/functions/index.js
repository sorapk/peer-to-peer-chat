const functions = require('firebase-functions');
const mExpress = require('express');
const mSocket = require('socket.io');
const kConst_PORT = process.env.PORT || 5000;

const server = mExpress()
  .get('/', (request, response) => {
    response.send(`server time: ${Date.now()}`);
  })
  .listen(kConst_PORT, () => console.log(`Listening on ${kConst_PORT}`));
const funcInstance = functions.https.onRequest(server);
const io = mSocket.listen(server);
const users = {};

io.on('connection', (socket) => {
  if (!users[socket.id]) {
    users[socket.id] = socket.id;
  }
  console.log('socket id:', socket.id);
  socket.emit('yourID', socket.id);
  io.sockets.emit('allUsers', users);
  socket.on('disconnect', () => {
    delete users[socket.id];
  });
  socket.on('callUser', (data) => {
    console.log('callUser:', data.userToCall);
    io.to(data.userToCall).emit('hey', {
      signal: data.signalData,
      from: data.from,
    });
  });
  socket.on('acceptCall', (data) => {
    io.to(data.to).emit('callAccepted', data.signal);
  });
});

// let voiceVideo = io.of('/voice-video').on('connection', (socket) => {
//   console.log('new connection:', socket.conn.id);
//   socket.on('message', function (message) {
//     console.log('message -> ', message);
//     let room = socket.rooms[Object.keys(socket.rooms)[1]];
//     socket.broadcast.to(room).emit('message', message);
//   });
//   socket.on('create or join', function (room) {
//     let clientsInRoom = voiceVideo.adapter.rooms[room];
//     let numClients =
//       clientsInRoom === undefined
//         ? 0
//         : Object.keys(clientsInRoom.sockets).length;
//     let returnObj = {
//       room: room,
//       config: kIceConfig,
//     };

//     if (numClients == 0) {
//       socket.join(room, function () {
//         socket.emit('created', returnObj);
//       });
//     } else if (numClients == 1) {
//       socket.broadcast.to(room).emit('join', room);
//       socket.join(room, function () {
//         socket.emit('joined', returnObj);
//       });
//     }
//   });
// });

exports.gateway = funcInstance;
