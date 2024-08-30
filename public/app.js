const socket = io();

const usernameSection = document.getElementById('usernameSection');
const joinDiv = document.getElementById('join');
const chatDiv = document.getElementById('chat');
const messagesDiv = document.getElementById('messages');
const chatListDiv = document.getElementById('chatList');
const createChatBtn = document.getElementById('createChat');
const leaveChatBtn = document.getElementById('leaveChat');
const newChatNameInput = document.getElementById('newChatName');
const messageInput = document.getElementById('message');
const sendMessageBtn = document.getElementById('sendMessage');
const currentChatNameH2 = document.getElementById('currentChatName');
const usernameInput = document.getElementById('usernameInput');
const setUsernameBtn = document.getElementById('setUsername');
const currentUsernameSpan = document.getElementById('currentUsername');
const shareLinkDiv = document.getElementById('shareLink');

let currentChatId = null;
let username = null;

setUsernameBtn.addEventListener('click', setUsername);
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') setUsername();
});

function getChatIdFromUrl() {
  const pathParts = window.location.pathname.split('/');
  return pathParts[pathParts.length - 1];
}

function setUsername() {
  const newUsername = usernameInput.value.trim();
  if (newUsername) {
    socket.emit('setUsername', newUsername);
  }
}

createChatBtn.addEventListener('click', () => {
  const chatName = newChatNameInput.value.trim();
  if (chatName) {
    socket.emit('createChat', chatName);
    newChatNameInput.value = '';
  }
});

leaveChatBtn.addEventListener('click', () => {
  leaveCurrentChat();
});

sendMessageBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const message = messageInput.value.trim();
  if (message && currentChatId) {
    socket.emit('sendMessage', { chatId: currentChatId, message });
    messageInput.value = '';
  }
}

function leaveCurrentChat() {
  currentChatId = null;
  joinDiv.style.display = 'block';
  chatDiv.style.display = 'none';
  shareLinkDiv.innerHTML = '';
  socket.emit('getChats');
}

socket.on('usernameSet', (newUsername) => {
  username = newUsername;
  currentUsernameSpan.textContent = `Logged in as: ${username}`;
  localStorage.setItem('username', username);
  usernameSection.style.display = 'none';
  joinDiv.style.display = 'block';
  socket.emit('getChats');
});

socket.on('chatCreated', ({ id, name }) => {
  joinChat(id, name);
});

socket.on('chatList', (chats) => {
  chatListDiv.innerHTML = chats.map(chat => 
    `<div class="chat-item" data-id="${chat.id}">${chat.name}</div>`
  ).join('');
  
  chatListDiv.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => {
      joinChat(item.dataset.id, item.textContent);
    });
  });
});

function joinChat(chatId, chatName) {
  socket.emit('joinChat', chatId);
  currentChatId = chatId;
  document.getElementById('join').style.display = 'none';
  document.getElementById('chat').style.display = 'block';
  document.getElementById('currentChatName').textContent = chatName;
  const shareLink = `${window.location.origin}/chat/${chatId}`;
  document.getElementById('shareLink').innerHTML = `Share this link: <a href="${shareLink}" target="_blank">${shareLink}</a>`;
}

socket.on('chatJoined', ({ chatId, chatName, messages }) => {
  joinChat(chatId, chatName);
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = messages.map(m => `<p>${m}</p>`).join('');
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on('newMessage', (message) => {
  messagesDiv.innerHTML += `<p>${message}</p>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});

socket.on('error', (error) => {
  alert(error);
});

// Check for saved username in local storage
const savedUsername = localStorage.getItem('username');
if (savedUsername) {
  socket.emit('setUsername', savedUsername);
} else {
  usernameSection.style.display = 'block';
}

// Check for chat ID in URL
const pathParts = window.location.pathname.split('/');
const chatIdFromUrl = pathParts[pathParts.length - 1];
if (chatIdFromUrl && chatIdFromUrl !== '') {
  if (username) {
    socket.emit('joinChat', chatIdFromUrl);
  } else {
    usernameSection.style.display = 'block';
    localStorage.setItem('pendingChatId', chatIdFromUrl);
  }
} else if (username) {
  socket.emit('getChats');
}

// Handle pending chat join after username is set
socket.on('usernameSet', () => {
  const pendingChatId = localStorage.getItem('pendingChatId');
  if (pendingChatId) {
    socket.emit('joinChat', pendingChatId);
    localStorage.removeItem('pendingChatId');
  } else {
    socket.emit('getChats');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const chatIdFromUrl = getChatIdFromUrl();
  if (chatIdFromUrl && chatIdFromUrl !== '') {
    socket.emit('joinChat', chatIdFromUrl);
  } else {
    socket.emit('getChats');
  }
});