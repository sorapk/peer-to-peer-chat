const functions = require('firebase-functions');
const mExpress = require('express');
const mSocket = require('socket.io');
const { user } = require('firebase-functions/lib/providers/auth');
const kConst_PORT = process.env.PORT || 5000;

//reference:
// https://stackoverflow.com/questions/32674391/io-emit-vs-socket-emit/32675498

const server = mExpress()
  .get('/', (request, response) => {
    response.send(`server time: ${Date.now()}`);
  })
  .listen(kConst_PORT, () => console.log(`Listening on ${kConst_PORT}`));
const funcInstance = functions.https.onRequest(server);
const io = mSocket.listen(server);
const users = {};
const room = {};
const socketToRoom = {};

io.on('connection', (socket) => {
  if (!users[socket.id]) {
    users[socket.id] = socket.id;
  }
  console.log('socket id:', socket.id);
  socket.emit('yourID', socket.id);
  io.sockets.emit('allUsers', users);
  socket.on('disconnect', () => {
    //handle disconnect from room
    const roomID = socketToRoom[socket.id];
    let usersInRoom = room[roomID];
    if (usersInRoom) {
      usersInRoom = usersInRoom.filter((id) => id !== socket.id);
      room[roomID] = usersInRoom;
    }

    if (socket.id in users) {
      delete users[socket.id];
    }
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

  // ======= room functionality ==========
  socket.on('join room', (roomID) => {
    console.log('join room, roomID:', roomID, 'socketID:', socket.id);
    if (room[roomID]) {
      const length = room[roomID].length;
      if (length === 4) {
        socket.emit('room full');
        return;
      }
      room[roomID].push(socket.id);
    } else {
      room[roomID] = [socket.id];
    }
    console.log('room users -->', room[roomID]);
    socketToRoom[socket.id] = roomID;
    const usersInThisRoom = room[roomID].filter((id) => id !== socket.id);
    console.log('users in this room -->', usersInThisRoom);
    socket.emit('all users', usersInThisRoom);
  });
  socket.on('sending signal', (payload) => {
    console.log('forwarding signal to:', payload.userToSignal);
    io.to(payload.userToSignal).emit('user joined', {
      signal: payload.signal,
      callerID: payload.callerID,
    });
  });
  socket.on('returning signal', (payload) => {
    io.to(payload.callerID).emit('receiving returned signal', {
      signal: payload.signal,
      id: socket.id,
    });
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
