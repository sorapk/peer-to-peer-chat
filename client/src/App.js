import React, { useEffect, useRef, useState } from 'react';
import { withRouter, Route, Switch, Redirect } from 'react-router-dom';
import './App.css';
import { firestore, auth, initializeApp } from 'firebase';
import Peer from 'simple-peer';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import {
  Connection,
  CALLER_MSG_INITIATE,
  CALLEE_MSG_ACCEPT,
} from './Connection.tsx';

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
      const userDB = await Connection();
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
