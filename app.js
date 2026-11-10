const homeScreen = document.querySelector("#home-screen");
const callScreen = document.querySelector("#call-screen");
const joinModal = document.querySelector("#join-modal");
const nameModal = document.querySelector("#name-modal");
const localVideo = document.querySelector("#local-video");
const videoPlaceholder = document.querySelector("#video-placeholder");
const toast = document.querySelector("#toast");
const roomCodeDisplay = document.querySelector("#room-code-display");
let displayName = localStorage.getItem("orbit-display-name") || "You";
let activeRoomCode = "";
let cameraStream = null;
let microphoneStream = null;
let screenStream = null;
let cameraOn = false;
let micOn = false;
let timerInterval = null;
let toastTimeout = null;
let callStartedAt = 0;

const $ = (selector) => document.querySelector(selector);
const initials = (name) => name.trim().slice(0, 1).toUpperCase() || "Y";

$("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date());
$("#current-year").textContent = String(new Date().getFullYear());
updateNames();
updateCameraButton();
updateMicButton();

function updateNames() {
  $("#profile-name").textContent = displayName === "You" ? "Your space" : displayName + "'s space";
  $("#participant-name").textContent = displayName;
  $("#self-video-name").textContent = displayName === "You" ? "You" : displayName + " (You)";
  $("#self-avatar").textContent = initials(displayName);
  $("#participant-avatar").textContent = initials(displayName);
  $(".participant-you").textContent = initials(displayName);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2400);
}

function makeRoomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function enterRoom(code) {
  activeRoomCode = code || makeRoomCode();
  roomCodeDisplay.textContent = activeRoomCode;
  $("#call-room-name").textContent = "Instant meeting";
  $("#participant-count").textContent = "1";
  homeScreen.classList.add("hidden");
  callScreen.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  callStartedAt = Date.now();
  updateTimer();
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
  await setCamera(true);
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - callStartedAt) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  $("#call-timer").textContent = minutes + ":" + seconds;
}

async function setCamera(enabled) {
  if (!enabled) {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    localVideo.srcObject = screenStream;
    cameraOn = false;
    videoPlaceholder.classList.toggle("hidden", Boolean(screenStream));
    updateCameraButton();
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraOn = false;
    videoPlaceholder.classList.remove("hidden");
    updateCameraButton();
    showToast("Camera access isn't available in this browser or page context.");
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
    localVideo.srcObject = screenStream || cameraStream;
    cameraOn = true;
    videoPlaceholder.classList.add("hidden");
    updateCameraButton();
  } catch (error) {
    cameraOn = false;
    videoPlaceholder.classList.remove("hidden");
    updateCameraButton();
    showToast(error.name === "NotAllowedError" ? "Camera permission was denied. You can still join without video." : "Couldn't start your camera. Check that it's connected and try again.");
  }
}

function updateCameraButton() {
  const button = $("#toggle-camera");
  button.classList.toggle("active-control", cameraOn);
  button.classList.toggle("is-off", !cameraOn);
  button.setAttribute("aria-pressed", String(cameraOn));
  button.setAttribute("aria-label", cameraOn ? "Turn camera off" : "Turn camera on");
  button.querySelector("span").textContent = cameraOn ? "Camera" : "Camera off";
}

function setMicTracks(enabled) {
  if (microphoneStream) {
    microphoneStream.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }
}

function updateMicButton() {
  const button = $("#toggle-mic");
  button.classList.toggle("active-control", micOn);
  button.classList.toggle("is-off", !micOn);
  button.setAttribute("aria-pressed", String(micOn));
  button.setAttribute("aria-label", micOn ? "Turn microphone off" : "Turn microphone on");
  button.querySelector("span").textContent = micOn ? "Mic" : "Mic off";
  $("#self-audio-indicator").classList.toggle("muted", !micOn);
  $(".participant-mic").style.color = micOn ? "#c8c6ce" : "#ff9a94";
}

function leaveRoom() {
  clearInterval(timerInterval);
  timerInterval = null;
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  if (microphoneStream) microphoneStream.getTracks().forEach((track) => track.stop());
  if (screenStream) screenStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  microphoneStream = null;
  screenStream = null;
  const shareButton = $("#share-screen");
  shareButton.classList.remove("active-control");
  shareButton.querySelector("span").textContent = "Share";
  localVideo.classList.remove("screen-shared");
  cameraOn = false;
  micOn = false;
  localVideo.srcObject = null;
  chatDrawer.classList.add("hidden");
  const messages = $(".chat-messages");
  if (messages) {
    const emptyState = document.createElement("div");
    emptyState.className = "chat-empty";
    const symbol = document.createElement("span");
    symbol.textContent = "✳";
    const heading = document.createElement("strong");
    heading.textContent = "Break the ice.";
    const description = document.createElement("p");
    description.textContent = "Send a little hello to get things started.";
    emptyState.append(symbol, heading, description);
    messages.replaceWith(emptyState);
  }
  $("#call-side-panel").classList.remove("panel-visible");
  callScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
  document.body.style.overflow = "";
  updateCameraButton();
  updateMicButton();
}

async function copyText(value, successMessage) {
  try {
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  } catch (error) {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (copied) showToast(successMessage);
    else showToast("Couldn't copy automatically. Your room code is ORBIT-" + activeRoomCode + ".");
  }
}

function inviteText() {
  return window.location.href.split("#")[0] + "#join-" + activeRoomCode;
}

function openJoinModal() {
  joinModal.classList.remove("hidden");
  $("#display-name").value = displayName === "You" ? "" : displayName;
  $("#meeting-code").focus();
}

function closeJoinModal() {
  joinModal.classList.add("hidden");
}

$("#new-meeting").addEventListener("click", () => enterRoom());
$("#hero-start").addEventListener("click", () => enterRoom());
$("#hero-join").addEventListener("click", openJoinModal);
$("#close-modal").addEventListener("click", closeJoinModal);
joinModal.addEventListener("click", (event) => {
  if (event.target === joinModal) closeJoinModal();
});
$("#join-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#display-name").value.trim();
  const code = $("#meeting-code").value.trim().toUpperCase().replace(/^ORBIT-/, "");
  if (!code) {
    $("#meeting-code").focus();
    showToast("Enter a meeting code to continue.");
    return;
  }
  if (!/^[A-Z0-9-]{3,18}$/.test(code)) {
    $("#meeting-code").focus();
    showToast("That code doesn't look right. Check it and try again.");
    return;
  }
  if (name) {
    displayName = name;
    localStorage.setItem("orbit-display-name", displayName);
    updateNames();
  }
  closeJoinModal();
  enterRoom(code);
});

$("#toggle-camera").addEventListener("click", () => setCamera(!cameraOn));
$("#toggle-mic").addEventListener("click", async () => {
  if (!micOn && !microphoneStream && !navigator.mediaDevices?.getUserMedia) {
    showToast("Microphone access isn't available in this browser or page context.");
    return;
  }
  if (!micOn && !microphoneStream && navigator.mediaDevices?.getUserMedia) {
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      showToast(error.name === "NotAllowedError" ? "Microphone permission was denied." : "Couldn't access your microphone. Check its connection and try again.");
      return;
    }
  }
  micOn = !micOn;
  setMicTracks(micOn);
  updateMicButton();
});
async function shareScreenHandler() {
  const button = $("#share-screen");
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
    localVideo.srcObject = cameraOn ? cameraStream : null;
    localVideo.classList.remove("screen-shared");
    videoPlaceholder.classList.toggle("hidden", cameraOn);
    $("#self-video-name").textContent = displayName === "You" ? "You" : displayName + " (You)";
    button.classList.remove("active-control");
    button.querySelector("span").textContent = "Share";
    return;
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    showToast("Screen sharing isn't supported in this browser.");
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    localVideo.srcObject = screenStream;
    localVideo.classList.add("screen-shared");
    videoPlaceholder.classList.add("hidden");
    $("#self-video-name").textContent = "Your screen";
    button.classList.add("active-control");
    button.querySelector("span").textContent = "Stop sharing";
    const stopSharing = () => {
      screenStream = null;
      localVideo.srcObject = cameraOn ? cameraStream : null;
      localVideo.classList.remove("screen-shared");
      videoPlaceholder.classList.toggle("hidden", cameraOn);
      $("#self-video-name").textContent = displayName === "You" ? "You" : displayName + " (You)";
      button.classList.remove("active-control");
      button.querySelector("span").textContent = "Share";
    };
    screenStream.getVideoTracks()[0].addEventListener("ended", stopSharing, { once: true });
  } catch (error) {
    screenStream = null;
    if (error.name !== "NotAllowedError") showToast("Couldn't start screen sharing. Try again.");
  }
}
$("#share-screen").addEventListener("click", shareScreenHandler);
$("#leave-call").addEventListener("click", leaveRoom);
$("#leave-top").addEventListener("click", leaveRoom);
$("#copy-invite").addEventListener("click", () => copyText(inviteText(), "Meeting link copied. Send it to someone you'd like to see."));
$("#stage-invite").addEventListener("click", () => copyText(inviteText(), "Meeting link copied. Send it to someone you'd like to see."));
$("#panel-copy").addEventListener("click", () => copyText(inviteText(), "Meeting link copied."));
$("#copy-room-code").addEventListener("click", () => copyText("ORBIT-" + activeRoomCode, "Room code copied."));
$("#panel-invite").addEventListener("click", () => copyText(inviteText(), "Meeting link copied."));
$("#invite-button").addEventListener("click", () => {
  activeRoomCode = activeRoomCode || makeRoomCode();
  roomCodeDisplay.textContent = activeRoomCode;
  const link = inviteText();
  copyText(link, "Meeting link copied. Your room is ready.");
  enterRoom(activeRoomCode);
});
$("#close-panel").addEventListener("click", () => $("#call-side-panel").classList.remove("panel-visible"));
$("#toggle-people").addEventListener("click", () => $("#call-side-panel").classList.toggle("panel-visible"));
const chatDrawer = $("#chat-drawer");
$("#toggle-chat").addEventListener("click", () => {
  chatDrawer.classList.toggle("hidden");
  if (!chatDrawer.classList.contains("hidden")) $("#chat-input").focus();
});
$("#close-chat").addEventListener("click", () => chatDrawer.classList.add("hidden"));
$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#chat-input");
  const message = input.value.trim();
  if (!message) return;
  let list = $(".chat-messages");
  if (!list) {
    list = document.createElement("div");
    list.className = "chat-messages";
    $(".chat-empty").replaceWith(list);
  }
  const bubble = document.createElement("div");
  bubble.className = "chat-message";
  bubble.textContent = message;
  list.append(bubble);
  list.scrollTop = list.scrollHeight;
  input.value = "";
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
  displayName = value;
  localStorage.setItem("orbit-display-name", displayName);
  updateNames();
  nameModal.classList.add("hidden");
});

$("#open-people").addEventListener("click", () => showToast("Invite a friend from the people card to get started."));
$("#people-more").addEventListener("click", () => showToast("Your people are always just one invite away."));
$("#view-schedule").addEventListener("click", () => showToast("Your next meeting is Monday catch-up at 10:30 AM."));
$("#notifications-button").addEventListener("click", () => showToast("You're all caught up. Enjoy the quiet."));
$("#upgrade-link").addEventListener("click", () => showToast("More room to grow, coming soon."));
$("#more-call-options").addEventListener("click", () => showToast("Your meeting is private and ready to share."));
document.querySelectorAll(".meeting-more").forEach((button) => {
  button.addEventListener("click", () => showToast("Meeting options are coming soon."));
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
