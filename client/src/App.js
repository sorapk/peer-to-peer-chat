import React, { useEffect, useRef, useState } from 'react';
import { withRouter, Route, Switch } from 'react-router-dom';
import { v1 as uuid } from 'uuid';

import './App.css';

import io from 'socket.io-client';
import Peer from 'simple-peer';
// reference:
// https://ui.dev/react-router-v4-programmatically-navigate/
const Video = (props) => {
  const ref = useRef();

  useEffect(() => {
    props.peer.on('stream', (stream) => {
      ref.current.srcObject = stream;
    });
  }, []);

  return (
    <div>
      <video playsInline autoPlay ref={ref}></video>
    </div>
  );
};
const Room = (props) => {
  const [peers, setPeers] = useState([]);
  const socketRef = useRef();
  const userVideoRef = useRef();
  const peersRef = useRef([]);
  // const roomID = props.match.params.id;
  const videoConstraints = {
    height: window.innerHeight / 2,
    width: window.innerWidth / 2,
  };
  useEffect(() => {
    socketRef.current = io.connect('http://localhost:5000');
    navigator.mediaDevices
      .getUserMedia({ video: videoConstraints, audio: false })
      .then((stream) => {
        userVideoRef.current.srcObject = stream;
        socketRef.current.emit('join room', props.match.params.id);
        socketRef.current.on('all users', (users) => {
          console.log('users in room to call -->', users);

          const peers = [];
          users.forEach((userID) => {
            const peer = createPeer(userID, socketRef.current.id, stream);
            peersRef.current.push({
              peerID: userID,
              peer,
            });
            peers.push(peer);
          });
          console.log('peers list:', peers);
          setPeers(peers);
        });
        socketRef.current.on('user joined', (payload) => {
          console.log('someone joined -->', payload.callerID);
          const peer = addPeer(payload.signal, payload.callerID, stream);
          peersRef.current.push({
            peerID: payload.callerID,
            peer,
          });
          const updatedPeerList = [...peers, peer];
          setPeers(updatedPeerList);
        });
        socketRef.current.on('receiving returned signal', (payload) => {
          console.log('receiving returned signal -->', payload.id);
          const item = peersRef.current.find((p) => p.peerID === payload.id);
          console.log('found item -->', item.peer);
          if (item.peer.readable === true) {
            item.peer.signal(payload.signal);
          }
        });
      });
  }, []);

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
    });
    console.log('peer created -->', peer);
    peer.on('signal', (signal) => {
      console.log('creating signal -->', signal);
      socketRef.current.emit('sending signal', {
        userToSignal,
        callerID,
        signal,
      });
    });

    return peer;
  };
  const addPeer = (incomingSignal, callerID, stream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on('signal', (signal) => {
      socketRef.current.emit('returning signal', { signal, callerID });
    });

    peer.signal(incomingSignal);

    return peer;
  };

  return (
    <div>
      <div>
        {socketRef.current ? ['my id: ', socketRef.current.id] : undefined}
      </div>
      <video muted ref={userVideoRef} autoPlay playsInline></video>
      {peers.map((peer, index) => {
        return <Video key={index} peer={peer}></Video>;
      })}
    </div>
  );
};
const CreateRoom = withRouter((props) => {
  const create = () => {
    const id = uuid();
    props.history.push(`/room/${id}`);
  };
  return <button onClick={create}>Create room</button>;
});
const App = withRouter((props) => {
  const [stream, setStream] = useState();
  const [users, setUsers] = useState({});
  const [yourID, setYourId] = useState('');
  const [receivingCall, setReceivingCall] = useState(false);
  const [callerSignal, setCallerSignal] = useState();
  const [callAccepted, setCallAcepted] = useState(false);
  const [caller, setCaller] = useState('');

  const userVideoRef = useRef();
  const partnerVideoRef = useRef();
  const socketRef = useRef();

  // useEffect(() => {
  //   (async () => {
  //     // initialize socket ref
  //     socketRef.current = io.connect('http://localhost:5000');
  //     socketRef.current.on('allUsers', (users) => {
  //       console.log('friends id received:', users);
  //       setUsers(users);
  //     });
  //     socketRef.current.on('yourID', (id) => {
  //       console.log('my id recieved:', id);
  //       setYourId(id);
  //     });
  //     socketRef.current.on('hey', (data) => {
  //       console.log('getting call:', data);
  //       setReceivingCall(true);
  //       setCaller(data.from);
  //       setCallerSignal(data.signal);
  //     });
  //   })();

  //   return () => {
  //     console.log('clean up');
  //   };
  // }, []);

  const onClickToggleCam = async () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(undefined);

      if (userVideoRef.current) {
        userVideoRef.current.srcObject = undefined;
      }
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      if (userVideoRef.current) {
        userVideoRef.current.srcObject = stream;
      }
      setStream(stream);
    }
  };
  const callPeer = (id) => {
    console.log('calling:', id);
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream,
      config: {
        iceServers: [
          {
            urls: 'stun:numb.viagenie.ca',
            username: 'sultan1640@gmail.com',
            credential: '98376683',
          },
          {
            urls: 'turn:numb.viagenie.ca',
            username: 'sultan1640@gmail.com',
            credential: '98376683',
          },
        ],
      },
    });
    peer.on('signal', (data) => {
      socketRef.current.emit('callUser', {
        userToCall: id,
        signalData: data,
        from: yourID,
      });
    });
    peer.on('stream', (stream) => {
      console.log('partner stream');
      if (partnerVideoRef.current) {
        partnerVideoRef.current.srcObject = stream;
      }
    });
    socketRef.current.on('callAccepted', (signal) => {
      console.log('call accepted', signal);
      peer.signal(signal);
      setCallAcepted(true);
    });
  };
  const acceptCall = () => {
    console.log('accepting call');
    setCallAcepted(true);
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: stream,
    });
    peer.on('signal', (data) => {
      console.log('signaling accept');
      socketRef.current.emit('acceptCall', { signal: data, to: caller });
    });
    peer.on('stream', (stream) => {
      console.log('incoming call stream:', stream);
      partnerVideoRef.current.srcObject = stream;
    });
    peer.signal(callerSignal);
  };
  const UserVideo = <video ref={userVideoRef} autoPlay></video>;
  const PartnerVideo = <video ref={partnerVideoRef} autoPlay></video>;
  const GettingCall = receivingCall ? (
    <div>
      <h1>{caller} is calling you</h1>
      <button onClick={acceptCall}>Accept</button>
    </div>
  ) : undefined;
  const OnlineFriendList = Object.keys(users).map((key) => {
    if (key === yourID) {
      return null;
    } else {
      return (
        <div key={key}>
          <button onClick={() => callPeer(key)}>Call {key}</button>
        </div>
      );
    }
  });
  // console.log(props.match.params.roomID);

  return (
    <div>
      {/* {props.location.pathname}
      {UserVideo}
      {PartnerVideo}
      {GettingCall}
      <div>
        <button onClick={onClickToggleCam}>
          {stream === undefined ? 'Enable Camera' : 'Disable Camera'}
        </button>
        {OnlineFriendList}
      </div> */}
      <CreateRoom />
      <Switch>
        <Route path='/room/:id' component={Room}></Route>
      </Switch>
    </div>
  );
});

export default App;
