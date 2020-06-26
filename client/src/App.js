import React, { useEffect, useRef, useState } from 'react';
import './App.css';

import io from 'socket.io-client';
import Peer from 'simple-peer';

const App = () => {
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

  useEffect(() => {
    (async () => {
      // initialize socket ref
      socketRef.current = io.connect('http://localhost:5000');
      socketRef.current.on('allUsers', (users) => {
        console.log('friends id received:', users);
        setUsers(users);
      });
      socketRef.current.on('yourID', (id) => {
        console.log('my id recieved:', id);
        setYourId(id);
      });
      socketRef.current.on('hey', (data) => {
        console.log('getting call:', data);
        setReceivingCall(true);
        setCaller(data.from);
        setCallerSignal(data.signal);
      });
    })();

    return () => {
      console.log('clean up');
    };
  }, []);

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
  return (
    <div>
      {UserVideo}
      {PartnerVideo}
      {GettingCall}
      <div>
        <button onClick={onClickToggleCam}>
          {stream === undefined ? 'Enable Camera' : 'Disable Camera'}
        </button>
        {OnlineFriendList}
      </div>
    </div>
  );
};

export default App;
