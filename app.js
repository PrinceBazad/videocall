const $ = (selector) => document.querySelector(selector);
const homeScreen = $("#home-screen");
const callScreen = $("#call-screen");
const joinModal = $("#join-modal");
const nameModal = $("#name-modal");
const localVideo = $("#local-video");
const videoPlaceholder = $("#video-placeholder");
const toast = $("#toast");
const roomCodeDisplay = $("#room-code-display");
const participantList = $("#participant-list");
const remoteVideoGrid = $("#remote-video-grid");
const chatDrawer = $("#chat-drawer");
const chatInput = $("#chat-input");
const chatMessages = $("#chat-messages");
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const roomCodePattern = /^[A-F0-9]{24}$/;
const micSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8"/></svg>';

let displayName = localStorage.getItem("orbit-display-name") || "You";
let activeRoomCode = "";
let activeRoom = null;
let cameraOn = false;
let micOn = false;
let screenSharing = false;
let timerInterval = null;
let toastTimeout = null;
let callStartedAt = 0;
const remoteParticipants = new Map();
const remoteVideoTracks = new Map();
const remoteAudioTracks = new Map();
let livekitSdk = null;

$("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());
$("#current-year").textContent = String(new Date().getFullYear());
updateNames();
updateCameraButton();
updateMicButton();

function initials(name) {
  return name.trim().slice(0, 1).toUpperCase() || "Y";
}

function updateNames() {
  $("#profile-name").textContent = displayName === "You" ? "Your space" : displayName + "'s space";
  $("#self-video-name").textContent = displayName === "You" ? "You" : displayName + " (You)";
  $("#self-avatar").textContent = initials(displayName);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 3200);
}

function makeRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function setConnectionStatus(status, message) {
  const indicator = $("#connection-indicator");
  indicator.classList.toggle("connection-error", status === "error");
  indicator.classList.toggle("connection-pending", status === "connecting" || status === "reconnecting");
  $("#call-status-indicator").classList.toggle("call-status-error", status === "error");
  $("#call-status-indicator").classList.toggle("call-status-pending", status === "connecting" || status === "reconnecting");
  $("#connection-note-copy").textContent = message;
  $("#retry-connection").classList.toggle("hidden", status !== "error");
}

function setConnectionSummary() {
  const count = remoteParticipants.size + (activeRoom ? 1 : 0);
  $("#participant-count").textContent = String(count);
  if (activeRoom) {
    $("#connection-note-copy").textContent = count === 1
      ? "Only you are here · Invite someone to join"
      : count + " people are in this meeting";
  }
}

function makeVideoElement() {
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  return video;
}

function renderLocalVideo() {
  const participant = activeRoom?.localParticipant;
  const screenPublication = participant?.getTrackPublication(livekitSdk.Track.Source.ScreenShare);
  const cameraPublication = participant?.getTrackPublication(livekitSdk.Track.Source.Camera);
  const publication = screenPublication?.track ? screenPublication : cameraPublication;
  if (!publication?.track) {
    localVideo.srcObject = null;
    videoPlaceholder.classList.remove("hidden");
    localVideo.classList.remove("screen-shared");
    $("#self-video-name").textContent = displayName === "You" ? "You" : displayName + " (You)";
    return;
  }
  publication.track.attach(localVideo);
  videoPlaceholder.classList.add("hidden");
  const sharing = publication.source === livekitSdk.Track.Source.ScreenShare;
  localVideo.classList.toggle("screen-shared", sharing);
  $("#self-video-name").textContent = sharing
    ? "Your screen"
    : displayName === "You" ? "You" : displayName + " (You)";
}

function updateCameraButton() {
  const button = $("#toggle-camera");
  button.classList.toggle("active-control", cameraOn);
  button.classList.toggle("is-off", !cameraOn);
  button.setAttribute("aria-pressed", String(cameraOn));
  button.setAttribute("aria-label", cameraOn ? "Turn camera off" : "Turn camera on");
  button.querySelector("span").textContent = cameraOn ? "Camera" : "Camera off";
}

function updateMicButton() {
  const button = $("#toggle-mic");
  button.classList.toggle("active-control", micOn);
  button.classList.toggle("is-off", !micOn);
  button.setAttribute("aria-pressed", String(micOn));
  button.setAttribute("aria-label", micOn ? "Turn microphone off" : "Turn microphone on");
  button.querySelector("span").textContent = micOn ? "Mic" : "Mic off";
  $("#self-audio-indicator").classList.toggle("muted", !micOn);
}

function createParticipantRow(participant, isLocal) {
  const row = document.createElement("div");
  row.className = "participant-row";
  row.dataset.participantId = participant.identity;

  const avatar = document.createElement("span");
  avatar.className = "participant-avatar";
  avatar.textContent = initials(isLocal ? displayName : participant.name || participant.identity);

  const name = document.createElement("span");
  name.className = "participant-name";
  const strong = document.createElement("strong");
  strong.textContent = isLocal ? displayName + " (You)" : participant.name || participant.identity;
  const role = document.createElement("small");
  role.textContent = isLocal ? "Meeting host" : "Guest";
  name.append(strong, role);

  const microphone = document.createElement("span");
  microphone.className = "participant-mic";
  microphone.innerHTML = micSvg;
  const enabled = isLocal ? micOn : participant.isMicrophoneEnabled;
  microphone.classList.toggle("participant-muted", !enabled);
  microphone.setAttribute("aria-label", enabled ? "Microphone on" : "Microphone off");

  row.append(avatar, name, microphone);
  return row;
}

function renderParticipantList() {
  participantList.replaceChildren();
  if (!activeRoom) return;
  participantList.append(createParticipantRow(activeRoom.localParticipant, true));
  for (const participantView of remoteParticipants.values()) {
    participantList.append(createParticipantRow(participantView.participant, false));
  }
  $("#participant-count").textContent = String(remoteParticipants.size + 1);
}

function createRemoteParticipant(participant) {
  let participantView = remoteParticipants.get(participant.identity);
  if (participantView) {
    participantView.participant = participant;
    return participantView;
  }

  const card = document.createElement("article");
  card.className = "remote-participant-card";
  card.dataset.participantId = participant.identity;

  const placeholder = document.createElement("div");
  placeholder.className = "remote-video-placeholder";
  const avatar = document.createElement("span");
  avatar.className = "remote-avatar";
  avatar.textContent = initials(participant.name || participant.identity);
  const waitingLabel = document.createElement("span");
  waitingLabel.textContent = "Camera is off";
  placeholder.append(avatar, waitingLabel);

  const feeds = document.createElement("div");
  feeds.className = "remote-participant-feeds";
  const footer = document.createElement("div");
  footer.className = "remote-participant-footer";
  footer.textContent = participant.name || participant.identity;
  card.append(placeholder, feeds, footer);
  remoteVideoGrid.append(card);

  participantView = { participant, card, feeds, placeholder };
  remoteParticipants.set(participant.identity, participantView);
  return participantView;
}

function addRemoteParticipant(participant) {
  createRemoteParticipant(participant);
  renderParticipantList();
  setConnectionSummary();
}

function removeRemoteParticipant(participant) {
  const participantView = remoteParticipants.get(participant.identity);
  if (!participantView) return;

  for (const [sid, item] of remoteVideoTracks) {
    if (item.identity === participant.identity) {
      item.track.detach();
      item.element.remove();
      remoteVideoTracks.delete(sid);
    }
  }
  for (const [sid, item] of remoteAudioTracks) {
    if (item.identity === participant.identity) {
      item.track.detach();
      item.element.remove();
      remoteAudioTracks.delete(sid);
    }
  }
  participantView.card.remove();
  remoteParticipants.delete(participant.identity);
  renderParticipantList();
  setConnectionSummary();
}

function addRemoteTrack(track, publication, participant) {
  const participantView = createRemoteParticipant(participant);
  if (track.kind === livekitSdk.Track.Kind.Video) {
    if (remoteVideoTracks.has(track.sid)) return;
    const feed = document.createElement("div");
    feed.className = "remote-video-feed";
    if (publication.source === livekitSdk.Track.Source.ScreenShare) feed.classList.add("remote-screen-feed");
    const video = makeVideoElement();
    const label = document.createElement("span");
    label.className = "remote-video-label";
    label.textContent = publication.source === livekitSdk.Track.Source.ScreenShare
      ? (participant.name || participant.identity) + " · screen"
      : participant.name || participant.identity;
    feed.append(video, label);
    track.attach(video);
    participantView.feeds.append(feed);
    participantView.placeholder.classList.add("hidden");
    remoteVideoTracks.set(track.sid, { identity: participant.identity, track, element: feed });
    return;
  }
  if (track.kind === livekitSdk.Track.Kind.Audio) {
    if (remoteAudioTracks.has(track.sid)) return;
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.playsInline = true;
    audio.className = "remote-audio";
    document.body.append(audio);
    track.attach(audio);
    remoteAudioTracks.set(track.sid, { identity: participant.identity, track, element: audio });
  }
}

function removeRemoteTrack(track, participant) {
  track.detach();
  const item = remoteVideoTracks.get(track.sid);
  if (item) {
    item.element.remove();
    remoteVideoTracks.delete(track.sid);
    const participantView = remoteParticipants.get(participant.identity);
    if (participantView && participantView.feeds.childElementCount === 0) {
      participantView.placeholder.classList.remove("hidden");
    }
  }
  const audio = remoteAudioTracks.get(track.sid);
  if (audio) {
    audio.element.remove();
    remoteAudioTracks.delete(track.sid);
  }
}

function appendChatMessage(message, author, isLocal) {
  const item = document.createElement("article");
  item.className = "chat-message-item";
  item.classList.toggle("chat-message-local", isLocal);
  const authorLabel = document.createElement("span");
  authorLabel.className = "chat-message-author";
  authorLabel.textContent = author;
  const bubble = document.createElement("div");
  bubble.className = "chat-message";
  bubble.textContent = message;
  item.append(authorLabel, bubble);
  chatMessages.append(item);
  $(".chat-empty").classList.add("hidden");
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function handleRoomData(payload, participant, kind, topic) {
  if (topic !== "orbit-chat" || !participant) return;
  let message;
  try {
    message = JSON.parse(decoder.decode(payload));
  } catch {
    return;
  }
  if (typeof message?.text !== "string" || message.text.length === 0 || message.text.length > 1000) return;
  appendChatMessage(message.text, participant.name || participant.identity, false);
}

function bindRoomEvents(room) {
  const { RoomEvent } = livekitSdk;
  room.on(RoomEvent.ParticipantConnected, addRemoteParticipant);
  room.on(RoomEvent.ParticipantDisconnected, removeRemoteParticipant);
  room.on(RoomEvent.TrackSubscribed, addRemoteTrack);
  room.on(RoomEvent.TrackUnsubscribed, removeRemoteTrack);
  room.on(RoomEvent.LocalTrackPublished, renderLocalVideo);
  room.on(RoomEvent.LocalTrackUnpublished, () => {
    cameraOn = Boolean(room.localParticipant.isCameraEnabled);
    micOn = Boolean(room.localParticipant.isMicrophoneEnabled);
    screenSharing = Boolean(room.localParticipant.isScreenShareEnabled);
    updateCameraButton();
    updateMicButton();
    updateShareButton();
    renderLocalVideo();
    renderParticipantList();
  });
  room.on(RoomEvent.TrackMuted, renderParticipantList);
  room.on(RoomEvent.TrackUnmuted, renderParticipantList);
  room.on(RoomEvent.DataReceived, handleRoomData);
  room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
    $("#enable-audio").classList.toggle("hidden", room.canPlaybackAudio);
  });
  room.on(RoomEvent.VideoPlaybackStatusChanged, () => {
    if (!room.canPlaybackVideo) $("#enable-audio").classList.remove("hidden");
  });
  room.on(RoomEvent.Reconnecting, () => setConnectionStatus("reconnecting", "Reconnecting to your meeting…"));
  room.on(RoomEvent.SignalReconnecting, () => setConnectionStatus("reconnecting", "Restoring your meeting connection…"));
  room.on(RoomEvent.Reconnected, () => {
    setConnectionStatus("connected", "Reconnected to your meeting.");
    setConnectionSummary();
  });
  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    if (state === livekitSdk.ConnectionState.Connected) {
      setConnectionStatus("connected", "Only you are here · Invite someone to join");
      setConnectionSummary();
    }
  });
  room.on(RoomEvent.Disconnected, () => {
    if (activeRoom !== room) return;
    activeRoom = null;
    $("#enable-audio").classList.add("hidden");
    cameraOn = false;
    micOn = false;
    screenSharing = false;
    clearRemoteParticipants();
    setConnectionStatus("error", "You've been disconnected. Try joining again.");
    updateCameraButton();
    updateMicButton();
    updateShareButton();
    renderLocalVideo();
    showToast("Your meeting connection ended. You can try joining again.");
  });
}

function clearRemoteParticipants() {
  for (const item of remoteVideoTracks.values()) item.track.detach();
  for (const item of remoteAudioTracks.values()) {
    item.track.detach();
    item.element.remove();
  }
  remoteVideoTracks.clear();
  remoteAudioTracks.clear();
  remoteParticipants.clear();
  remoteVideoGrid.replaceChildren();
  renderParticipantList();
}

async function connectToRoom() {
  if (activeRoom) return;
  setConnectionStatus("connecting", "Connecting to your meeting…");
  $("#retry-connection").classList.add("hidden");
  $("#enable-audio").classList.add("hidden");
  let room;
  try {
    const response = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: activeRoomCode, name: displayName }),
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(response.status === 404
        ? "The meeting API is unavailable. Run this site with npm run dev or deploy it to Vercel."
        : "The meeting API returned an invalid response.");
    }
    if (!response.ok) throw new Error(result.error || "Couldn't get permission to join this meeting.");
    if (typeof result.serverUrl !== "string" || typeof result.token !== "string") {
      throw new Error("The video service returned an invalid connection response.");
    }
    livekitSdk = await import("livekit-client");
    room = new livekitSdk.Room({ adaptiveStream: true, dynacast: true });
    activeRoom = room;
    bindRoomEvents(room);
    await room.connect(result.serverUrl, result.token);
    if (activeRoom !== room) {
      await room.disconnect();
      return;
    }
    for (const participant of room.remoteParticipants.values()) {
      addRemoteParticipant(participant);
      for (const publication of participant.trackPublications.values()) {
        if (publication.track) addRemoteTrack(publication.track, publication, participant);
      }
    }
    renderParticipantList();
    setConnectionStatus("connected", "Only you are here · Invite someone to join");
    setConnectionSummary();
    await setCamera(true);
  } catch (error) {
    if (room && activeRoom === room) {
      activeRoom = null;
      try {
        await room.disconnect();
      } catch {
        showToast("The incomplete meeting connection could not be closed cleanly.");
      }
    }
    clearRemoteParticipants();
    setConnectionStatus("error", error.message || "Couldn't connect to the video service.");
    showToast(error.message || "Couldn't connect to the video service.");
  }
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - callStartedAt) / 1000);
  $("#call-timer").textContent = String(Math.floor(elapsed / 60)).padStart(2, "0")
    + ":" + String(elapsed % 60).padStart(2, "0");
}

async function enterRoom(code) {
  activeRoomCode = code || makeRoomCode();
  roomCodeDisplay.textContent = activeRoomCode;
  $("#call-room-name").textContent = "Orbit meeting";
  $("#participant-count").textContent = "1";
  homeScreen.classList.add("hidden");
  callScreen.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  callStartedAt = Date.now();
  updateTimer();
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
  clearRemoteParticipants();
  renderLocalVideo();
  await connectToRoom();
}

async function setCamera(enabled) {
  if (!activeRoom) {
    if (enabled) showToast("Connect to your meeting before turning on your camera.");
    return;
  }
  try {
    await activeRoom.localParticipant.setCameraEnabled(enabled);
    cameraOn = activeRoom.localParticipant.isCameraEnabled;
    updateCameraButton();
    renderLocalVideo();
    renderParticipantList();
  } catch (error) {
    cameraOn = false;
    updateCameraButton();
    renderLocalVideo();
    showToast(error.name === "NotAllowedError"
      ? "Camera permission was denied. Allow camera access in your browser settings."
      : "Couldn't start your camera. Check that it's connected and not in use by another app.");
  }
}

async function setMicrophone(enabled) {
  if (!activeRoom) {
    showToast("Connect to your meeting before turning on your microphone.");
    return;
  }
  try {
    await activeRoom.localParticipant.setMicrophoneEnabled(enabled);
    micOn = activeRoom.localParticipant.isMicrophoneEnabled;
    updateMicButton();
    renderParticipantList();
  } catch (error) {
    micOn = false;
    updateMicButton();
    renderParticipantList();
    showToast(error.name === "NotAllowedError"
      ? "Microphone permission was denied. Allow microphone access in your browser settings."
      : "Couldn't start your microphone. Check its connection and try again.");
  }
}

function updateShareButton() {
  const button = $("#share-screen");
  button.classList.toggle("active-control", screenSharing);
  button.setAttribute("aria-pressed", String(screenSharing));
  button.setAttribute("aria-label", screenSharing ? "Stop sharing your screen" : "Share your screen");
  button.querySelector("span").textContent = screenSharing ? "Stop sharing" : "Share";
}

async function shareScreenHandler() {
  if (!activeRoom) {
    showToast("Connect to your meeting before sharing your screen.");
    return;
  }
  try {
    await activeRoom.localParticipant.setScreenShareEnabled(!screenSharing, { audio: false });
    screenSharing = activeRoom.localParticipant.isScreenShareEnabled;
    updateShareButton();
    renderLocalVideo();
  } catch (error) {
    screenSharing = false;
    updateShareButton();
    showToast(error.name === "NotAllowedError"
      ? "Screen sharing was cancelled."
      : "Couldn't share your screen. Check your browser's screen-sharing permissions.");
  }
}

function leaveRoom() {
  clearInterval(timerInterval);
  timerInterval = null;
  const room = activeRoom;
  activeRoom = null;
  if (room) {
    room.disconnect().catch(() => showToast("The meeting closed, but the network connection ended unexpectedly."));
  }
  cameraOn = false;
  micOn = false;
  screenSharing = false;
  $("#enable-audio").classList.add("hidden");
  clearRemoteParticipants();
  localVideo.srcObject = null;
  videoPlaceholder.classList.remove("hidden");
  localVideo.classList.remove("screen-shared");
  chatDrawer.classList.add("hidden");
  chatMessages.replaceChildren();
  $(".chat-empty").classList.remove("hidden");
  $("#call-side-panel").classList.remove("panel-visible");
  $("#retry-connection").classList.add("hidden");
  setConnectionStatus("connecting", "Connecting to your meeting…");
  callScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
  document.body.style.overflow = "";
  updateCameraButton();
  updateMicButton();
  updateShareButton();
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (copied) showToast(successMessage);
    else showToast("Couldn't copy automatically. Share the ORBIT-" + activeRoomCode + " meeting code instead.");
  }
}

function inviteText() {
  return window.location.origin + window.location.pathname + window.location.search + "#join-" + activeRoomCode;
}

function openJoinModal() {
  joinModal.classList.remove("hidden");
  $("#display-name").value = displayName === "You" ? "" : displayName;
  $("#meeting-code").focus();
}

function closeJoinModal() {
  joinModal.classList.add("hidden");
}

function resetChat() {
  chatMessages.replaceChildren();
  $(".chat-empty").classList.remove("hidden");
}

$("#new-meeting").addEventListener("click", () => enterRoom());
$("#hero-start").addEventListener("click", () => enterRoom());
$("#hero-join").addEventListener("click", openJoinModal);
$("#close-modal").addEventListener("click", closeJoinModal);
joinModal.addEventListener("click", (event) => {
  if (event.target === joinModal) closeJoinModal();
});
$("#join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#display-name").value.trim();
  const code = $("#meeting-code").value.trim().toUpperCase().replace(/^ORBIT-/, "");
  if (!roomCodePattern.test(code)) {
    $("#meeting-code").focus();
    showToast("Enter the full 24-character room code from the meeting invitation.");
    return;
  }
  if (name) {
    displayName = name;
    localStorage.setItem("orbit-display-name", displayName);
    updateNames();
  }
  closeJoinModal();
  await enterRoom(code);
});

$("#retry-connection").addEventListener("click", connectToRoom);
$("#enable-audio").addEventListener("click", async () => {
  if (!activeRoom) return;
  try {
    await activeRoom.startAudio();
    await activeRoom.startVideo();
    $("#enable-audio").classList.add("hidden");
  } catch {
    showToast("Your browser is blocking call playback. Check its sound and autoplay settings.");
  }
});
$("#toggle-camera").addEventListener("click", () => setCamera(!cameraOn));
$("#toggle-mic").addEventListener("click", () => setMicrophone(!micOn));
$("#share-screen").addEventListener("click", shareScreenHandler);
$("#leave-call").addEventListener("click", leaveRoom);
$("#leave-top").addEventListener("click", leaveRoom);

for (const selector of ["#copy-invite", "#stage-invite", "#panel-invite"]) {
  $(selector).addEventListener("click", () => copyText(inviteText(), "Meeting link copied. Anyone with the link can join."));
}
$("#panel-copy").addEventListener("click", () => copyText(inviteText(), "Meeting link copied."));
$("#copy-room-code").addEventListener("click", () => copyText("ORBIT-" + activeRoomCode, "Room code copied."));
$("#invite-button").addEventListener("click", async () => {
  await enterRoom();
  await copyText(inviteText(), "Meeting link copied. Anyone with the link can join.");
});
$("#close-panel").addEventListener("click", () => $("#call-side-panel").classList.remove("panel-visible"));
$("#toggle-people").addEventListener("click", () => $("#call-side-panel").classList.toggle("panel-visible"));
$("#toggle-chat").addEventListener("click", () => {
  chatDrawer.classList.toggle("hidden");
  if (!chatDrawer.classList.contains("hidden")) chatInput.focus();
});
$("#close-chat").addEventListener("click", () => chatDrawer.classList.add("hidden"));
$("#chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  if (!activeRoom || activeRoom.state !== livekitSdk.ConnectionState.Connected) {
    showToast("Connect to your meeting before sending a chat message.");
    return;
  }
  try {
    await activeRoom.localParticipant.publishData(encoder.encode(JSON.stringify({ text: message })), {
      reliable: true,
      topic: "orbit-chat",
    });
    appendChatMessage(message, displayName, true);
    chatInput.value = "";
  } catch {
    showToast("Couldn't send your message. Check your meeting connection and try again.");
  }
});

$("#profile-button").addEventListener("click", () => {
  nameModal.classList.remove("hidden");
  $("#profile-name-input").value = displayName === "You" ? "" : displayName;
  $("#profile-name-input").focus();
});
$("#close-name-modal").addEventListener("click", () => nameModal.classList.add("hidden"));
nameModal.addEventListener("click", (event) => {
  if (event.target === nameModal) nameModal.classList.add("hidden");
});
$("#name-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = $("#profile-name-input").value.trim();
  if (!value) {
    $("#profile-name-input").focus();
    showToast("Enter your name to save your profile.");
    return;
  }
  if (value.length > 32) {
    showToast("Your name must be 32 characters or fewer.");
    return;
  }
  displayName = value;
  localStorage.setItem("orbit-display-name", displayName);
  updateNames();
  renderParticipantList();
  nameModal.classList.add("hidden");
});

$("#open-people").addEventListener("click", () => showToast("People on the dashboard are sample contacts; meeting guests appear when they join a room."));
$("#people-more").addEventListener("click", () => showToast("The people card shows sample contacts."));
$("#view-schedule").addEventListener("click", () => showToast("The dashboard schedule is sample content; use Start a meeting to create a live room."));
$("#notifications-button").addEventListener("click", () => showToast("Notifications will appear here when the dashboard is connected to an account."));
$("#upgrade-link").addEventListener("click", () => showToast("Orbit Pro isn't available yet."));
$("#more-call-options").addEventListener("click", () => showToast("Use Copy invite to share a secure, room-specific invitation."));

document.querySelectorAll(".meeting-more").forEach((button) => {
  button.addEventListener("click", () => showToast("These scheduled meetings are sample content."));
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeJoinModal();
    nameModal.classList.add("hidden");
    chatDrawer.classList.add("hidden");
    $("#call-side-panel").classList.remove("panel-visible");
  }
});

if (window.location.hash.startsWith("#join-")) {
  $("#meeting-code").value = window.location.hash.slice(6);
  openJoinModal();
}
