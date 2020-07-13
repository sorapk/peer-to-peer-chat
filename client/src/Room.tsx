import React, { useEffect, useRef, useState } from 'react';
import { withRouter, RouteComponentProps } from 'react-router-dom';
import {
  Connection,
  CALLEE_MSG_ACCEPT,
  CALLER_MSG_INITIATE,
} from './Connection';
import Peer from 'simple-peer';
import SimplePeer from 'simple-peer';

enum PeerState {
  PEER_STATE_0 = 'not-connected',
  PEER_STATE_1 = 'initiated',
  PEER_STATE_2 = 'connecting',
  PEER_STATE_3 = 'connected',
  PEER_STATE_4 = 'failed',
}
type FixLater = any;

const Video = (props: { peer: SimplePeer.Instance | null }) => {
  const ref = useRef<FixLater>();

  useEffect(() => {
    if (props.peer) {
      props.peer.on('stream', (stream: MediaStream) => {
        console.log('peer stream:', stream);
        if (ref.current) {
          ref.current.srcObject = stream;
        }
      });
    }
  }, []);

  return (
    <div>
      <video playsInline autoPlay ref={ref}></video>
    </div>
  );
};

class PeerInfo {
  id: string;
  state: PeerState;
  peer: SimplePeer.Instance | null;

  constructor(id: string) {
    this.id = id;
    this.state = PeerState.PEER_STATE_0;
    this.peer = null;
  }
  peerProcessSignal(signal: SimplePeer.SignalData) {
    if (this.peer) {
      this.peer.signal(signal);
    }
  }
  peerCleanUp() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}
interface Props extends RouteComponentProps<{ id: string }> {
  connection: Connection;
}

interface UserInRoom {
  [key: string]: PeerInfo;
}

export const Room = withRouter(({ ...props }: Props) => {
  const userVideoRef = useRef<any>();
  const roomID = props.match.params.id;
  const videoConstraints = {
    height: window.innerHeight / 2,
    width: window.innerWidth / 2,
  };
  console.log('roomID-->', roomID, 'props -->', props);
  const connection = props.connection;

  // ==============
  const userInRoomRef = useRef<UserInRoom>({});
  const [userInRoomState, setUserInRoomState] = useState({});

  useEffect(() => {
    if (connection === undefined) {
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: videoConstraints, audio: false })
      .then(gotMedia);
  }, []);

  const onPeerConnect = (peerInfo: PeerInfo | undefined) => {
    if (peerInfo === undefined) return;
    console.log('connection establised:', peerInfo.id);
    peerInfo.state = PeerState.PEER_STATE_3;
    setUserInRoomState({});
  };
  const onPeerDisconnect = (peerInfo: PeerInfo | undefined) => {
    if (peerInfo === undefined) return;
    peerInfo.state = PeerState.PEER_STATE_0;
    console.log('connection closed:', peerInfo.id);
    peerInfo.peerCleanUp();
    setUserInRoomState({});
  };
  const onPeerError = (peerInfo: PeerInfo | undefined, err: any) => {
    if (peerInfo === undefined) return;
    console.log('connection error:', peerInfo.id, err);
    peerInfo.state = PeerState.PEER_STATE_4;
    peerInfo.peerCleanUp();
    setUserInRoomState({});
  };

  const gotMedia = async (stream: MediaStream) => {
    if (userVideoRef === undefined || userVideoRef.current === undefined) {
      return;
    }

    userVideoRef.current.srcObject = stream;

    const roomInfo = await connection.joinRoom(roomID);

    if (roomInfo === null) {
      alert('This room does not exist.');
      props.history.push(`/`);
    }

    //0. initialize list of user in room
    for (const userID in roomInfo.user) {
      if (userID !== connection.userID()) {
        userInRoomRef.current[userID] = new PeerInfo(userID);
      }
    }
    setUserInRoomState({});

    //1. register listener to incoming request to connect
    connection.onCallerMsg(
      roomID,
      'request-connect',
      async (
        callerPayload: any[],
        callerMsgInd: number,
        callerMsgCnt: number,
        from: string
      ) => {
        while (callerMsgInd < callerMsgCnt) {
          const msg = callerPayload[callerMsgInd++];

          if (userInRoomRef.current[from] === undefined) {
            userInRoomRef.current[from] = new PeerInfo(from);
          }
          const currentPeerInfo = userInRoomRef.current[from];

          if (
            currentPeerInfo.state === PeerState.PEER_STATE_0 &&
            msg === CALLER_MSG_INITIATE
          ) {
            currentPeerInfo.state = PeerState.PEER_STATE_1;

            // initiate call
            console.log('initiation recieved from:', from);
            await connection.sendCallerAResponse(CALLEE_MSG_ACCEPT, from);
          } else if (currentPeerInfo.state === PeerState.PEER_STATE_1) {
            currentPeerInfo.state = PeerState.PEER_STATE_2;

            // process offer
            console.log('recieved offer recieved from:', from);
            console.log('offer:', msg);
            currentPeerInfo.peer = addPeer(msg, from, stream, (signal: any) => {
              connection.sendCallerAResponse(signal, from);
            });
            //listen to peer events
            currentPeerInfo.peer.on('connect', () => {
              onPeerConnect(userInRoomRef.current[from]);
            });
            currentPeerInfo.peer.on('close', () => {
              onPeerDisconnect(userInRoomRef.current[from]);
            });
            currentPeerInfo.peer.on('error', (err: any) => {
              onPeerError(userInRoomRef.current[from], err);
            });

            // process offer
            currentPeerInfo.peer.signal(msg);
          } else if (
            currentPeerInfo.state === PeerState.PEER_STATE_2 ||
            currentPeerInfo.state === PeerState.PEER_STATE_3
          ) {
            // process ICE
            console.log('recieved ICE recieved from:', from);
            console.log('ICE:', msg);
            currentPeerInfo.peerProcessSignal(msg);
          } else {
            // bad state, clean up
            currentPeerInfo.state = PeerState.PEER_STATE_4;
            currentPeerInfo.peerCleanUp();
          }
        }
        setUserInRoomState({});
      }
    );
    //2. register listener to incoming responses from callee
    connection.onCalleeMsg(
      roomID,
      'response-signal',
      async (
        calleePayload: any[],
        calleeMsgInd: number,
        calleeMsgCnt: number,
        to: string
      ) => {
        while (calleeMsgInd < calleeMsgCnt) {
          const msg = calleePayload[calleeMsgInd++];

          if (userInRoomRef.current[to] === undefined) {
            userInRoomRef.current[to] = new PeerInfo(to);
          }
          const currentPeerInfo = userInRoomRef.current[to];
          if (
            //callee accepted
            currentPeerInfo.state === PeerState.PEER_STATE_0 &&
            msg === CALLEE_MSG_ACCEPT
          ) {
            currentPeerInfo.state = PeerState.PEER_STATE_1;

            // callee accepted, create and send offer to be sent
            console.log('callee accepted call:', to);

            currentPeerInfo.peer = createPeer(to, stream, (signal: any) => {
              connection.sendCalleeAResponse(signal, to);
            });
            //listen to peer events
            currentPeerInfo.peer.on('connect', () => {
              onPeerConnect(userInRoomRef.current[to]);
            });
            currentPeerInfo.peer.on('close', () => {
              onPeerDisconnect(userInRoomRef.current[to]);
            });
            currentPeerInfo.peer.on('error', (err: any) => {
              onPeerError(userInRoomRef.current[to], err);
            });
          } else if (
            currentPeerInfo.state === PeerState.PEER_STATE_1 ||
            currentPeerInfo.state === PeerState.PEER_STATE_2 ||
            currentPeerInfo.state === PeerState.PEER_STATE_3
          ) {
            //process callee accepted and ICE candidate
            if (currentPeerInfo.state === PeerState.PEER_STATE_1) {
              currentPeerInfo.state = PeerState.PEER_STATE_2;
            }

            // process offer
            console.log('recieved answer/ICE recieved from callee:', to);
            console.log('callee data:', msg);

            // process offer
            currentPeerInfo.peerProcessSignal(msg);
          } else {
            // bad state, clean up
            currentPeerInfo.state = PeerState.PEER_STATE_4;
            currentPeerInfo.peerCleanUp();
          }
        }
        setUserInRoomState({});
      }
    );

    //3. call existing peers in room
    callPeerInRoom(stream, roomInfo);
  };
  const callPeerInRoom = (stream: MediaStream, roomInfo: { user: any }) => {
    //3. call each user in the roo
    console.log({ roomInfo });
    const userInRoom = roomInfo.user;
    const currentUserID = connection.userID();
    const joinedTimestamp = connection.firebaseTimeToTimestamp(
      userInRoom[currentUserID]
    );
    console.log('current user joined room timestamp:', joinedTimestamp);

    for (const peerID in userInRoom) {
      const timestamp = connection.firebaseTimeToTimestamp(userInRoom[peerID]);

      // call users that were on before current user
      if (peerID !== currentUserID && timestamp < joinedTimestamp) {
        callPeer(peerID, stream, roomID);
      }
    }
  };
  const callPeer = (peerID: string, stream: any, roomID: string) => {
    connection.initiateConnection(roomID, 'initiate-connection', peerID);
  };
  const createPeer = (
    userToSignal: any,
    stream: MediaStream,
    onSignal: { (signal: any): void; (arg0: any): void }
  ) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
    });
    console.log('peer created -->', peer);
    peer.on('signal', (signal: any) => {
      console.log('signal created for:', userToSignal, signal);
      onSignal(signal);
    });

    return peer;
  };
  const addPeer = (
    incomingSignal: any,
    callerID: any,
    stream: MediaStream,
    onSignal: { (signal: any): void; (arg0: any): void }
  ) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });
    peer.on('signal', (signal: any) => {
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
      <h3>My User ID: {connection ? connection.userID() : undefined}</h3>
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
