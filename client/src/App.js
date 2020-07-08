import React, { useEffect, useRef, useState } from 'react';
import { withRouter, Route, Switch, Redirect } from 'react-router-dom';
import './App.css';
import { firestore, auth, initializeApp } from 'firebase';
import Peer from 'simple-peer';
import { BrowserRouter, HashRouter } from 'react-router-dom';

const firebase = { firestore, auth, initializeApp };
const UserDB = async () => {
  const firebaseConfig = JSON.parse(process.env.REACT_APP_PEER_FIREBASE);

  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  console.log('initializing firebase');

  const userAuth = await firebase.auth().signInAnonymously();
  console.log('user auth uid:', userAuth.user.uid);

  let existingUserRef = await db
    .collection('user')
    .doc(userAuth.user.uid)
    .get();
  console.log('==== user existing info ====');
  console.log('user has existing info status:', existingUserRef.exists);
  console.log('user existing info id:', existingUserRef.id);
  console.log('user existing info:', existingUserRef.data());

  if (!(existingUserRef && existingUserRef.exists)) {
    await db.collection('user').doc(userAuth.user.uid).set({
      authenInfo: null,
      friendList: [],
      roomOwner: [],
      roomMemeber: [],
    });
  }
  const userRef = await db.collection('user').doc(userAuth.user.uid);
  console.log('userRef:', userRef);
  console.log('userRef id:', userRef.id);

  const firebaseTimeToTimestamp = (firebaseTimestamp) => {
    const { seconds, nanoseconds } = firebaseTimestamp;

    const timestamp = new firebase.firestore.Timestamp(
      seconds,
      nanoseconds
    ).toMillis();

    return timestamp;
  };
  const processCallerData = async (docID) => {
    const docRef = await db.doc(`connection/${docID}`);
    return await db.runTransaction(async (transaction) => {
      let doc = await transaction.get(docRef);
      if (doc.exists) {
        const { callerPayload, from, lastUpdated } = doc.data();
        let { callerMsgInd, callerMsgCnt } = doc.data();

        const currentTime = firebase.firestore.Timestamp.now().toMillis();
        const lastUpdateMili = firebaseTimeToTimestamp(lastUpdated);
        const expired = currentTime - lastUpdateMili >= 30000;

        console.log('incoming caller msg:', {
          callerPayload,
          callerMsgInd,
          callerMsgCnt,
          from,
          lastUpdateMili,
          currentTime,
          expired,
        });

        if (callerMsgInd >= callerMsgCnt || expired) {
          console.log('no caller msg to process');
          return null;
        }

        const copyPayload = Object.assign({}, callerPayload);
        const copyMsgInd = callerMsgInd;

        //process incoming data
        while (callerMsgInd < callerMsgCnt)
          delete callerPayload[callerMsgInd++];
        console.log('updating remote copy:', { callerPayload, callerMsgInd });

        await transaction.update(docRef, {
          callerPayload,
          callerMsgInd,
          callerMsgDiff: callerMsgCnt - callerMsgInd,
          lastUpdated: firebase.firestore.Timestamp.now().toDate(),
        });

        return {
          callerPayload: copyPayload,
          callerMsgInd: copyMsgInd,
          callerMsgCnt,
          from,
        };
      }
      return null;
    });
  };
  const processCalleeData = async (docID) => {
    const docRef = await db.doc(`connection/${docID}`);
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (doc.exists) {
        let { calleePayload, to, lastUpdated } = doc.data();
        let { calleeMsgInd, calleeMsgCnt } = doc.data();

        const currentTime = firebase.firestore.Timestamp.now().toMillis();
        const lastUpdateMili = firebaseTimeToTimestamp(lastUpdated);
        const expired = currentTime - lastUpdateMili >= 30000;

        console.log('incoming callee msg:', {
          calleePayload,
          calleeMsgInd,
          calleeMsgCnt,
          to,
          lastUpdateMili,
          currentTime,
          expired,
        });

        if (calleeMsgInd >= calleeMsgCnt || expired) {
          console.log('no callee msg to process');
          return null;
        }

        const copyPayload = Object.assign({}, calleePayload);
        const copyMsgInd = calleeMsgInd;

        //process incoming data
        while (calleeMsgInd < calleeMsgCnt)
          delete calleePayload[calleeMsgInd++];
        console.log('updating remote copy:', { calleePayload, calleeMsgInd });

        await transaction.update(docRef, {
          calleePayload,
          calleeMsgInd,
          calleeMsgDiff: calleeMsgCnt - calleeMsgInd,
          lastUpdated: firebase.firestore.Timestamp.now().toDate(),
        });

        return {
          calleePayload: copyPayload,
          calleeMsgInd: copyMsgInd,
          calleeMsgCnt,
          to,
        };
      }
      return null;
    });
  };

  return {
    userID: function () {
      return userRef.id;
    },
    userInfo: function () {
      if (userRef === null) {
      }
    },
    on: function (roomID, message, callback) {
      // db.collection(`msg-queue`)
      //   .where('roomID', '==', roomID)
      //   .where('message', '==', message)
      //   .where('msgRead', '==', false)
      //   .where('to', '==', userRef.id)
      //   .onSnapshot(async (snapshot) => {
      //     snapshot.forEach(async (doc) => {
      //       console.log('incoming msg doc id:', doc.id);
      //       console.log('incoming msg doc data:', doc.data());
      //       const response = await callback(doc.data());
      //       db.doc(`msg-queue/${doc.id}`).update({ response, msgRead: true });
      //     });
      //   });
    },
    onCallerMsg: function (roomID, message, callback) {
      db.collection('connection')
        .where('roomID', '==', roomID)
        .where('to', '==', userRef.id)
        .where('callerMsgDiff', '>', 0)
        .onSnapshot((snapshot) => {
          snapshot.forEach(async (doc) => {
            if (doc.exists) {
              const data = await processCallerData(doc.id);

              if (data) {
                const {
                  callerPayload,
                  callerMsgInd,
                  callerMsgCnt,
                  from,
                } = data;
                console.log('processing payload:', {
                  callerPayload,
                  callerMsgInd,
                  callerMsgCnt,
                });
                await callback(callerPayload, callerMsgInd, callerMsgCnt, from);
              }
            }
          });
        });
    },
    onCalleeMsg: function (roomID, message, callback) {
      db.collection('connection')
        .where('roomID', '==', roomID)
        .where('from', '==', userRef.id)
        .where('calleeMsgDiff', '>', 0)
        .onSnapshot((snapshot) => {
          snapshot.forEach(async (doc) => {
            if (doc.exists) {
              const data = await processCalleeData(doc.id);

              if (data) {
                const { calleePayload, calleeMsgInd, calleeMsgCnt, to } = data;

                await callback(calleePayload, calleeMsgInd, calleeMsgCnt, to);
              }
            }
          });
        });
    },
    sendCallerAResponse: async function (data, from) {
      const connectionID = [from, userRef.id].sort().join('_');
      console.log('responding to caller:', from);
      console.log('connection id:', connectionID);
      console.log({ data });

      const docRef = await db.doc(`connection/${connectionID}`);

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (doc.exists) {
          let { calleePayload, calleeMsgCnt, calleeMsgInd } = doc.data();

          calleePayload[calleeMsgCnt] = data;
          calleeMsgCnt++;

          await transaction.update(docRef, {
            calleeMsgCnt,
            calleePayload,
            calleeMsgDiff: calleeMsgCnt - calleeMsgInd,
            lastUpdated: firebase.firestore.Timestamp.now().toDate(),
          });
        }
      });
    },
    sendCalleeAResponse: async function (data, to) {
      const connectionID = [to, userRef.id].sort().join('_');
      console.log('responding to callee:', to);
      console.log('connection id:', connectionID);
      console.log({ data });

      const docRef = await db.doc(`connection/${connectionID}`);

      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        if (doc.exists) {
          let { callerPayload, callerMsgCnt, callerMsgInd } = doc.data();

          callerPayload[callerMsgCnt] = data;
          callerMsgCnt++;

          await transaction.update(docRef, {
            callerMsgCnt,
            callerPayload,
            callerMsgDiff: callerMsgCnt - callerMsgInd,
            lastUpdated: firebase.firestore.Timestamp.now().toDate(),
          });
        }
      });
    },
    initiateConnection: async function (roomID, message, to) {
      try {
        const connectionID = [to, userRef.id].sort().join('_');
        console.log('initiating connnection from:', userRef.id);
        console.log('connection id:', connectionID);
        console.log({ roomID, message, to, from: userRef.id });

        // check if other caller is in control
        const connectionRef = await db.doc(`connection/${connectionID}`);

        await db.runTransaction(async (transaction) => {
          const priorConnectionDoc = await transaction.get(connectionRef);

          const priorConData =
            priorConnectionDoc.exists === true
              ? priorConnectionDoc.data()
              : null;
          let priorConExpired = false;

          if (priorConData) {
            const controlLastUpdated = this.firebaseTimeToTimestamp(
              priorConData.lastUpdated
            );
            const currentTime = firebase.firestore.Timestamp.now().toMillis();
            priorConExpired = currentTime - controlLastUpdated >= 30000; //expired after 30 seconds

            console.log(
              'prior control expire status:',
              priorConExpired,
              ', milisecond elapsed:',
              currentTime - controlLastUpdated
            );
          }

          if (priorConData === null || priorConExpired) {
            // initiate connection
            console.log('creating new connection');
            await transaction.set(connectionRef, {
              from: userRef.id,
              to,
              roomID,
              message,
              // =============
              callerMsgCnt: 1,
              callerMsgInd: 0,
              callerMsgDiff: 1,
              callerPayload: { 0: CALLER_MSG_INITIATE },
              // ==============
              calleeMsgCnt: 0,
              calleeMsgInd: 0,
              calleeMsgDiff: 0,
              calleePayload: {},
              // ==============
              lastUpdated: firebase.firestore.Timestamp.now().toDate(),
            });
          }
        });
      } catch (e) {
        console.error('msg send error:', e);
      }
    },
    emit: async function (roomID, message, data, to) {},
    respond: async function (roomID, message, data, to) {},
    sendAndWaitForResponse: async function (
      roomID,
      message,
      payload,
      to,
      timeout = 5000
    ) {
      console.log('creating message for:', userRef.id);
      console.log({ roomID, message, payload, from: userRef.id, to, timeout });
      try {
        await db.doc(`msg-queue/${userRef.id}`).set({
          from: userRef.id,
          response: null,
          msgRead: false,
          to,
          message,
          roomID,
          payload,
        });
      } catch (e) {
        console.error('msg send error:', e);
      }
      const TIMEOUT_FLAG = 'timeout';
      let unsubListener = null;
      let isTimedout = true;

      const responsePromise = new Promise((resolve, reject) => {
        unsubListener = db.doc(`msg-queue/${userRef.id}`).onSnapshot((doc) => {
          const { msgRead, response } = doc.data();
          if (msgRead === true) {
            unsubListener();
            console.log('recieved response:', doc.data());
            isTimedout = false;
            resolve(response);
          }
        });
      });
      const timeoutPromise = new Promise((resolve, reject) =>
        setTimeout(() => {
          if (isTimedout) {
            console.error('Promise Timeout');
            console.log('unsub listener');
            unsubListener();
            reject(TIMEOUT_FLAG);
          } else {
            resolve();
          }
        }, timeout)
      );
      const result = await Promise.race([responsePromise, timeoutPromise]);

      return result;
    },
    joinRoom: async function (roomID) {
      try {
        console.log('joining room:', roomID);
        if (roomID) {
          const docRef = await db.doc(`room/${roomID}`);
          const doc = await docRef.get();

          if (doc && doc.exists) {
            console.log('userRef in room:', userRef.id);
            const user = {
              ['user.' +
              userRef.id]: firebase.firestore.Timestamp.now().toDate(),
            };
            console.log('room data:', doc.data());
            console.log('msg queue data:', user);
            await docRef.update(user);
            const updatedDoc = await docRef.get();
            // await db.doc(`room/${roomID}`).onSnapshot(async (doc) => {
            //   const data = doc.data();
            //   const queue = data.userMsgQueue[userRef.id];

            //   if (queue.length > 0) {
            //     console.log('consuming data:', queue);
            //     const blankQueue = { ['userMsgQueue.' + userRef.id]: [] };
            //     await docRef.update(blankQueue);
            //   }
            // });

            return updatedDoc.data();
          } else {
            console.log("room doesn't exist:", roomID);
          }
        }
      } catch (e) {
        console.error('join room exception:', e);
      }
      return null;
    },
    createRoom: async function () {
      try {
        const docRef = await db.collection('room').add({
          user: {},
          created: firebase.firestore.Timestamp.now().toDate(),
        });
        const res = await userRef.update({
          roomOwner: firebase.firestore.FieldValue.arrayUnion(docRef.id),
        });
        console.log('create room id:', docRef.id);
        console.log('create room info:', res);
        return docRef.id;
      } catch (e) {
        console.error('create room exception:', e);
      }
      return null;
    },
    firebaseTimeToTimestamp: firebaseTimeToTimestamp,
  };
};

const CALLER_MSG_INITIATE = 'initiate';

const CALLEE_MSG_ACCEPT = 'callee-accept';

const PEER_STATE_0 = 'not-connected';
const PEER_STATE_1 = 'initiated';
const PEER_STATE_2 = 'connecting';
const PEER_STATE_3 = 'connected';
const PEER_STATE_4 = 'failed';

const PeerInfo = function (id) {
  this.id = id;
  this.state = PEER_STATE_0;
  this.peer = null;
};

// reference:
// https://ui.dev/react-router-v4-programmatically-navigate/
// const CreateRoom = withRouter(({ ...props }) => {
//   const create = async () => {
//     // const id = uuid();
//     // const roomId = await props.createRoom();
//     // props.history.push(`/room/${roomId}`);

//     console.log('this is some props -->', props);
//   };
//   return <button onClick={create}>Create room</button>;
// });
const Video = (props) => {
  const ref = useRef();

  useEffect(() => {
    props.peer.on('stream', (stream) => {
      console.log('peer stream:', stream);
      ref.current.srcObject = stream;
    });
  }, []);

  return (
    <div>
      <video playsInline autoPlay ref={ref}></video>
    </div>
  );
};
const Room = withRouter(({ ...props }) => {
  const userVideoRef = useRef();
  const roomID = props.match.params.id;
  const videoConstraints = {
    height: window.innerHeight / 2,
    width: window.innerWidth / 2,
  };
  console.log('roomID-->', roomID, 'props -->', props);
  const userDB = props.userDB;

  // ==============
  const userInRoomRef = useRef();
  const [userInRoomState, setUserInRoomState] = useState({});

  useEffect(() => {
    if (userDB === undefined) {
      //return if not initialized
      return;
    }
    if (userInRoomRef.current === undefined) {
      userInRoomRef.current = {};
    }
    navigator.mediaDevices
      .getUserMedia({ video: videoConstraints, audio: false })
      .then(gotMedia);
  }, []);
  const gotMedia = async (stream) => {
    userVideoRef.current.srcObject = stream;

    const roomInfo = await userDB.joinRoom(roomID);
    if (roomInfo === null) {
      alert('This room does not exist.');
      props.history.push(`/`);
    }

    //0. initialize list of user in room
    for (const userID in roomInfo.user) {
      if (userID !== userDB.userID()) {
        userInRoomRef.current[userID] = new PeerInfo(userID);
      }
    }
    setUserInRoomState({});

    //1. register listener to incoming request to connect
    userDB.onCallerMsg(
      roomID,
      'request-connect',
      async (callerPayload, callerMsgInd, callerMsgCnt, from) => {
        while (callerMsgInd < callerMsgCnt) {
          const msg = callerPayload[callerMsgInd++];

          if (userInRoomRef.current[from] === undefined) {
            userInRoomRef.current[from] = new PeerInfo(from);
          }
          const currentPeerInfo = userInRoomRef.current[from];

          if (
            currentPeerInfo.state === PEER_STATE_0 &&
            msg === CALLER_MSG_INITIATE
          ) {
            currentPeerInfo.state = PEER_STATE_1;

            // initiate call
            console.log('initiation recieved from:', from);
            await userDB.sendCallerAResponse(CALLEE_MSG_ACCEPT, from);
          } else if (currentPeerInfo.state === PEER_STATE_1) {
            currentPeerInfo.state = PEER_STATE_2;

            // process offer
            console.log('recieved offer recieved from:', from);
            console.log('offer:', msg);
            currentPeerInfo.peer = addPeer(msg, from, stream, (signal) => {
              userDB.sendCallerAResponse(signal, from);
            });
            //listen to peer events
            currentPeerInfo.peer.on('connect', () => {
              console.log(
                'connection connected:',
                userInRoomRef.current[from].id
              );
              userInRoomRef.current[from].state = PEER_STATE_3;
              setUserInRoomState({});
            });
            currentPeerInfo.peer.on('close', () => {
              userInRoomRef.current[from].state = PEER_STATE_0;
              console.log('connection closed:', userInRoomRef.current[from].id);

              if (userInRoomRef.current[from].peer) {
                userInRoomRef.current[from].peer.destroy();
                userInRoomRef.current[from].peer = undefined;
              }
              setUserInRoomState({});
            });
            currentPeerInfo.peer.on('error', (err) => {
              console.log(
                'connection error:',
                userInRoomRef.current[from].id,
                err
              );

              userInRoomRef.current[from].state = PEER_STATE_4;
              if (userInRoomRef.current[from].peer) {
                userInRoomRef.current[from].peer.destroy();
                userInRoomRef.current[from].peer = undefined;
              }
              setUserInRoomState({});
            });

            // process offer
            currentPeerInfo.peer.signal(msg);
          } else if (
            currentPeerInfo.state === PEER_STATE_2 ||
            currentPeerInfo.state === PEER_STATE_3
          ) {
            // process ICE
            console.log('recieved ICE recieved from:', from);
            console.log('ICE:', msg);
            currentPeerInfo.peer.signal(msg);
          } else {
            // bad state, clean up
            currentPeerInfo.state = PEER_STATE_4;
            if (currentPeerInfo.peer) {
              currentPeerInfo.peer.destroy();
              currentPeerInfo.peer = undefined;
            }
          }
        }
        setUserInRoomState({});
      }
    );
    //2. register listener to incoming responses from callee
    userDB.onCalleeMsg(
      roomID,
      'response-signal',
      async (calleePayload, calleeMsgInd, calleeMsgCnt, to) => {
        while (calleeMsgInd < calleeMsgCnt) {
          const msg = calleePayload[calleeMsgInd++];

          if (userInRoomRef.current[to] === undefined) {
            userInRoomRef.current[to] = new PeerInfo(to);
          }
          const currentPeerInfo = userInRoomRef.current[to];

          if (
            //callee accepted
            currentPeerInfo.state === PEER_STATE_0 &&
            msg === CALLEE_MSG_ACCEPT
          ) {
            currentPeerInfo.state = PEER_STATE_1;

            // callee accepted, create and send offer to be sent
            console.log('callee accepted call:', to);

            currentPeerInfo.peer = createPeer(to, stream, (signal) => {
              userDB.sendCalleeAResponse(signal, to);
            });

            //listen to peer events
            currentPeerInfo.peer.on('connect', () => {
              userInRoomRef.current[to].state = PEER_STATE_3;
              console.log('connection connect:', userInRoomRef.current[to].id);

              setUserInRoomState({});
            });
            currentPeerInfo.peer.on('close', () => {
              console.log('connection cosed:', userInRoomRef.current[to].id);

              userInRoomRef.current[to].state = PEER_STATE_0;
              if (userInRoomRef.current[to].peer) {
                userInRoomState[to].peer.destroy();
                userInRoomState[to].peer = undefined;
              }
              setUserInRoomState({});
            });
            currentPeerInfo.peer.on('error', (err) => {
              console.log(
                'connection error:',
                userInRoomRef.current[to].id,
                err
              );

              userInRoomRef.current[to].state = PEER_STATE_4;
              if (userInRoomRef.currentom[to].peer) {
                userInRoomRef.current[to].peer.destroy();
                userInRoomRef.current[to].peer = undefined;
              }
              setUserInRoomState({});
            });
          } else if (
            currentPeerInfo.state === PEER_STATE_1 ||
            currentPeerInfo.state === PEER_STATE_2 ||
            currentPeerInfo.state === PEER_STATE_3
          ) {
            //process callee accepted and ICE candidate
            if (currentPeerInfo.state === PEER_STATE_1) {
              currentPeerInfo.state = PEER_STATE_2;
            }

            // process offer
            console.log('recieved answer/ICE recieved from callee:', to);
            console.log('callee data:', msg);

            // process offer
            currentPeerInfo.peer.signal(msg);
          } else {
            // bad state, clean up
            currentPeerInfo.state = PEER_STATE_4;
            if (currentPeerInfo.peer) {
              currentPeerInfo.peer.destroy();
              currentPeerInfo.peer = undefined;
            }
          }
        }

        setUserInRoomState({});
      }
    );

    //3. call existing peers in room
    callPeerInRoom(stream, roomInfo);
  };
  const callPeerInRoom = (stream, roomInfo) => {
    //3. call each user in the roo
    console.log({ roomInfo });
    const userInRoom = roomInfo.user;
    const currentUserID = userDB.userID();
    const joinedTimestamp = userDB.firebaseTimeToTimestamp(
      userInRoom[currentUserID]
    );
    console.log('current user joined room timestamp:', joinedTimestamp);

    for (const peerID in userInRoom) {
      const timestamp = userDB.firebaseTimeToTimestamp(userInRoom[peerID]);

      // call users that were on before current user
      if (peerID !== currentUserID && timestamp < joinedTimestamp) {
        callPeer(peerID, stream, roomID);
      }
    }
  };
  const callPeer = (peerID, stream, roomID) => {
    userDB.initiateConnection(roomID, 'initiate-connection', peerID);
  };
  const createPeer = (userToSignal, stream, onSignal) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
    });
    console.log('peer created -->', peer);
    peer.on('signal', (signal) => {
      console.log('signal created for:', userToSignal, signal);
      onSignal(signal);
    });

    return peer;
  };
  const addPeer = (incomingSignal, callerID, stream, onSignal) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });
    peer.on('signal', (signal) => {
      console.log('returning signal created for', callerID, signal);
      onSignal(signal);
    });
    return peer;
  };

  const peerList = [];
  for (const peerid in userInRoomRef.current) {
    if (userInRoomRef.current[peerid].peer) {
      peerList.push(userInRoomRef.current[peerid].peer);
    }
  }
  const stateToColor = {
    failed: 'red',
    initiated: 'orange',
    'not-connected': 'grey',
    connecting: 'yellow',
    connected: 'green',
  };

  const stat = !userInRoomRef.current
    ? null
    : Object.keys(userInRoomRef.current).map((key) => {
        return (
          <li key={key}>
            User ID: {key} Status:{' '}
            <span
              style={{
                backgroundColor: stateToColor[userInRoomRef.current[key].state],
              }}
            >
              {userInRoomRef.current[key].state}
            </span>
          </li>
        );
      });
  console.log('peer list:', peerList);
  console.log(userInRoomRef.current);
  return (
    <div>
      <h3>My User ID: {userDB ? userDB.userID() : undefined}</h3>
      <video muted ref={userVideoRef} autoPlay playsInline></video>
      <h3>User In Room:</h3>
      <ul>{stat}</ul>
      <hr></hr>
      {peerList.map((peer, index) => {
        return (
          <div key={index}>
            {index}
            <Video peer={peer}></Video>
          </div>
        );
      })}
    </div>
  );
});

const App = (props) => {
  const [userDB, setUserDB] = useState();
  const [roomPath, setRoomPath] = useState(null);

  useEffect(() => {
    (async () => {
      const userDB = await UserDB();
      setUserDB(userDB);
    })();
  }, []);

  const createRoom = async () => {
    const roomId = await userDB.createRoom();
    setRoomPath(`/room/${roomId}`);
  };
  return (
    <HashRouter basename='/'>
      <React.StrictMode>
        <button onClick={createRoom}>Create Room</button>
        {roomPath ? <Redirect to={roomPath} /> : undefined}
        <Switch>
          <Route
            path='/room/:id'
            component={() => <Room {...props} userDB={userDB} />}
          ></Route>
        </Switch>
      </React.StrictMode>
    </HashRouter>
  );
};

export default App;
