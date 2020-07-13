import SimplePeer from 'simple-peer';
import Peer from 'simple-peer';

enum PeerState {
  PEER_STATE_0 = 'not-connected',
  PEER_STATE_1 = 'initiated',
  PEER_STATE_2 = 'connecting',
  PEER_STATE_3 = 'connected',
  PEER_STATE_4 = 'failed',
}
export class PeerInfo {
  id: string;
  state: PeerState;
  peer: SimplePeer.Instance | null;

  constructor(id: string) {
    this.id = id;
    this.state = PeerState.PEER_STATE_0;
    this.peer = null;
  }
  __initPeer(
    stream: MediaStream,
    peerType: 'initiator' | 'non-initiator',
    onSignal: (signal: SimplePeer.SignalData) => void,
    onEvent: (event: 'connect' | 'disconnect' | 'error') => void
  ) {
    const options = {
      initiator: peerType === 'initiator',
      trickle: false,
      stream,
    };
    const peer = new Peer(options);
    peer.on('signal', (signal: any) => {
      onSignal(signal);
    });
    peer.on('connect', () => {
      console.log('connection establised:', this.id);
      this.state = PeerState.PEER_STATE_3;
      onEvent('connect');
    });
    peer.on('close', () => {
      this.state = PeerState.PEER_STATE_0;
      console.log('connection closed:', this.id);
      this.__peerCleanUp();
      onEvent('disconnect');
    });
    peer.on('error', (err: any) => {
      console.log('connection error:', this.id, err);
      this.state = PeerState.PEER_STATE_4;
      onEvent('error');
    });
    this.peer = peer;
  }
  __peerProcessSignal(signal: SimplePeer.SignalData) {
    if (this.peer) {
      this.peer.signal(signal);
    }
  }
  __peerCleanUp() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
  // ===================
  processCallerPayload(
    myStream: MediaStream,
    callerID: string,
    payload: any,
    onSignal: (signal: SimplePeer.SignalData) => void,
    onEvent: (event: 'connect' | 'disconnect' | 'error') => void
  ) {
    if (this.state === PeerState.PEER_STATE_0) {
      this.state = PeerState.PEER_STATE_1;
      // initiate call
      console.log('initiation recieved from:', callerID);
    } else if (this.state === PeerState.PEER_STATE_1) {
      this.state = PeerState.PEER_STATE_2;

      // process offer
      console.log('recieved offer recieved from:', callerID);
      console.log('offer:', payload);

      this.__initPeer(myStream, 'non-initiator', onSignal, onEvent);
      // process offer
      this.__peerProcessSignal(payload);
    } else if (
      this.state === PeerState.PEER_STATE_2 ||
      this.state === PeerState.PEER_STATE_3
    ) {
      // process ICE
      console.log('recieved ICE recieved from:', callerID);
      console.log('ICE:', payload);
      this.__peerProcessSignal(payload);
    } else {
      // bad state, clean up
      this.state = PeerState.PEER_STATE_4;
      this.__peerCleanUp();
    }
  }
  processCalleePayload(
    myStream: MediaStream,
    calleeID: string,
    payload: any,
    onSignal: (signal: SimplePeer.SignalData) => void,
    onEvent: (event: 'connect' | 'disconnect' | 'error') => void
  ) {
    if (
      //callee accepted
      this.state === PeerState.PEER_STATE_0
    ) {
      this.state = PeerState.PEER_STATE_1;
      // callee accepted, create and send offer to be sent
      console.log('callee accepted call:', calleeID);
      this.__initPeer(myStream, 'non-initiator', onSignal, onEvent);
    } else if (
      this.state === PeerState.PEER_STATE_1 ||
      this.state === PeerState.PEER_STATE_2 ||
      this.state === PeerState.PEER_STATE_3
    ) {
      //process callee accepted and ICE candidate
      if (this.state === PeerState.PEER_STATE_1) {
        this.state = PeerState.PEER_STATE_2;
      }
      // process offer
      console.log('recieved answer/ICE recieved from callee:', calleeID);
      console.log('callee data:', payload);
      // process offer
      this.__peerProcessSignal(payload);
    } else {
      // bad state, clean up
      this.state = PeerState.PEER_STATE_4;
      this.__peerCleanUp();
    }
  }
}
