const socket = io();

const usernameSection = document.getElementById('usernameSection');
const joinDiv = document.getElementById('join');
const chatDiv = document.getElementById('chat');
const messagesDiv = document.getElementById('messages');
const chatListDiv = document.getElementById('chatList');
const createChatBtn = document.getElementById('createChat');
const leaveChatBtn = document.getElementById('leaveChat');
const messageInput = document.getElementById('message');
const sendMessageBtn = document.getElementById('sendMessage');
const currentChatNameH2 = document.getElementById('currentChatName');
const usernameInput = document.getElementById('usernameInput');
const setUsernameBtn = document.getElementById('setUsername');
const currentUsernameSpan = document.getElementById('currentUsername');
const shareLinkDiv = document.getElementById('shareLink');
const notificationSound = new Audio('/public/sounds/notification.mp3');

let isJoining = false; // New flag to prevent multiple join attempts
let currentChatId = null;
let username = null;

let vapidPublicKey;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(function(registration) {
        console.log('Service Worker registered successfully:', registration);
        return registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
      })
      .then(function(subscription) {
        console.log('User is subscribed:', subscription);
        return sendSubscriptionToServer(subscription);
      })
      .catch(function(error) {
        console.error('Service Worker error:', error);
      });
  }
}

function getVapidPublicKey() {
  return fetch('/vapidPublicKey')
    .then(response => response.json())
    .then(data => {
      vapidPublicKey = data.vapidPublicKey;
    });
}

setUsernameBtn.addEventListener('click', setUsername);
usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') setUsername();
});


function updateChatList() {
  const chats = JSON.parse(localStorage.getItem('chats') || '[]');
  const chatListDiv = document.getElementById('chatList');
  chatListDiv.innerHTML = chats.map(chat => 
    `<div class="chat-item" data-chat-id="${chat.id}">${chat.name}</div>`
  ).join('');
  
  chatListDiv.querySelectorAll('.chat-item').forEach(item => {
    item.addEventListener('click', () => {
      joinChat(item.dataset.chatId, item.textContent);
    });
  });
}

function getChatIdFromUrl() {
  const pathParts = window.location.pathname.split('/');
  return pathParts[pathParts.length - 1];
}

function addMessageToChat(message) {
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML += `<p>${message}</p>`;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function setUsername() {
  const newUsername = usernameInput.value.trim();
  if (newUsername) {
    console.log('Setting username:', newUsername);
    socket.emit('setUsername', newUsername);
  }
}

document.getElementById('createChat').addEventListener('click', function() {
  const chatName = prompt("Enter a name for the new chat:");
  if (chatName && chatName.trim() !== '') {
      socket.emit('createChat', chatName.trim());
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
  const messageInput = document.getElementById('message');
  const message = messageInput.value.trim();
  if (message && currentChatId) {
    socket.emit('sendMessage', { chatId: currentChatId, message });
    messageInput.value = '';
  }
}

function leaveChat() {
  // Function to leave the current chat, go back to main page
  currentChatId = null;
  document.getElementById('join').style.display = 'block';
  document.getElementById('chat').style.display = 'none';
  document.getElementById('messages').innerHTML = '';
  updateChatList();
}

function joinChat(chatId, chatName) {
  if (currentChatId === chatId || isJoining) {
    console.log('Already in this chat or joining process in progress');
    return;
  }

  isJoining = true;
  currentChatId = chatId;
  joinDiv.style.display = 'none';
  chatDiv.style.display = 'block';
  
  // Set a temporary name if chatName is not provided
  currentChatNameH2.textContent = chatName || 'Loading...';
  
  const shareLink = `${window.location.origin}/chat/${chatId}`;
  shareLinkDiv.innerHTML = `Share this link: <a href="${shareLink}" target="_blank">${shareLink}</a>`;
  socket.emit('joinChat', chatId);

  // Add or update chat in local storage
  let chats = JSON.parse(localStorage.getItem('chats') || '[]');
  const existingChatIndex = chats.findIndex(chat => chat.id === chatId);
  if (existingChatIndex !== -1) {
    chats[existingChatIndex].name = chatName || chats[existingChatIndex].name;
  } else {
    chats.push({ id: chatId, name: chatName || 'Unnamed Chat' });
  }
  localStorage.setItem('chats', JSON.stringify(chats));

  // Update chat list in UI
  updateChatList();

  // Update URL
  history.pushState(null, '', `/chat/${chatId}`);

  isJoining = false;
}

socket.on('usernameSet', (newUsername) => {
  console.log('Username set:', newUsername);
  username = newUsername;
  localStorage.setItem('username', username);
  currentUsernameSpan.textContent = `Logged in as: ${username}`;
  usernameSection.style.display = 'none';

  // Subscribe to push notifications
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    getVapidPublicKey()
      .then(() => navigator.serviceWorker.register('/service-worker.js'))
      .then(function(registration) {
        console.log('Service Worker registered successfully:', registration);
        return registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
      })
      .then(function(subscription) {
        console.log('User is subscribed:', subscription);
        return fetch('/api/save-subscription/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(subscription)
        });
      })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Bad status code from server.');
        }
        return response.json();
      })
      .then(function(responseData) {
        if (!(responseData.data && responseData.data.success)) {
          throw new Error('Bad response from server.');
        }
        console.log('Subscription sent to server successfully');
      })
      .catch(function(error) {
        console.error('Error:', error);
      });
  }

  const pendingChatId = localStorage.getItem('pendingChatId');
  if (pendingChatId) {
    console.log('Joining pending chat:', pendingChatId);
    joinChat(pendingChatId);
    localStorage.removeItem('pendingChatId');
  } else {
    console.log('Showing join section');
    joinDiv.style.display = 'block';
  }
});

socket.on('chatCreated', ({ id, name }) => {
  joinChat(id, name);
  let chats = JSON.parse(localStorage.getItem('chats') || '[]');
  if (!chats.some(chat => chat.id === id)) {
    chats.push({ id, name });
    localStorage.setItem('chats', JSON.stringify(chats));
  }
  updateChatList();
});

socket.on('chatJoined', ({ chatId, chatName, messages }) => {
  // Update the chat name in the UI
  currentChatNameH2.textContent = chatName || 'Unnamed Chat';
  
  // Update or add the chat in local storage
  let chats = JSON.parse(localStorage.getItem('chats') || '[]');
  const existingChatIndex = chats.findIndex(chat => chat.id === chatId);
  if (existingChatIndex !== -1) {
    chats[existingChatIndex].name = chatName;
  } else {
    chats.push({ id: chatId, name: chatName });
  }
  localStorage.setItem('chats', JSON.stringify(chats));

  // Join the chat (this will update the UI elements)
  joinChat(chatId, chatName);

  // Display messages
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = messages.map(m => `<p>${m}</p>`).join('');
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Update the chat list in the UI
  updateChatList();
});

socket.on('newMessage', (message) => {
  addMessageToChat(message);

  // Play sound if the window is not focused
  if (!document.hasFocus()) {
    notificationSound.play().catch(e => console.log('Error playing sound:', e));
  }
});

socket.on('error', (error) => {
  alert(error);
  isJoining = false; // Reset the joining flag in case of error
});

document.getElementById('deleteChat').addEventListener('click', function() {
  if (confirm('Are you sure you want to remove this chat from your list? You can still rejoin using the invite link.')) {
      socket.emit('removeChat', currentChatId);
  }
});

socket.on('chatRemoved', function(chatId) {
  // Remove the chat from the user's chat list
  const chatElement = document.querySelector(`[data-chat-id="${chatId}"]`);
  if (chatElement) {
      chatElement.remove();
  }
  
  // If the user is currently in the removed chat, go back to the chat list
  if (currentChatId === chatId) {
      document.getElementById('chat').style.display = 'none';
      document.getElementById('join').style.display = 'block';
      currentChatId = null;
  }
  
  // Update the chat list in the UI
  updateChatList();
});

socket.on('chatDeleted', function() {
  document.getElementById('messages').innerHTML = '';
  document.getElementById('chat').style.display = 'none';
  document.getElementById('join').style.display = 'block';
  alert('The chat has been deleted.');
  updateChatList(); // Assuming you have this function to refresh the chat list
});

function requestNotificationPermission() {
  return new Promise(function(resolve, reject) {
    const permissionResult = Notification.requestPermission(function(result) {
      resolve(result);
    });

    if (permissionResult) {
      permissionResult.then(resolve, reject);
    }
  })
  .then(function(permissionResult) {
    if (permissionResult !== 'granted') {
      throw new Error('We weren\'t granted permission.');
    }
  });
}

function subscribeUserToPush() {
  return navigator.serviceWorker.register('/service-worker.js')
    .then(function(registration) {
      const subscribeOptions = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
        )
      };

      return registration.pushManager.subscribe(subscribeOptions);
    })
    .then(function(pushSubscription) {
      console.log('Received PushSubscription: ', JSON.stringify(pushSubscription));
      return pushSubscription;
    });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function sendSubscriptionToServer(subscription) {
  console.log('Sending subscription to server:', subscription);
  return fetch('/api/save-subscription/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({subscription, username})
  })
  .then(function(response) {
    if (!response.ok) {
      throw new Error('Bad status code from server.');
    }
    return response.json();
  })
  .then(function(responseData) {
    if (!(responseData.data && responseData.data.success)) {
      throw new Error('Bad response from server.');
    }
    console.log('Subscription successfully sent to server');
  })
  .catch(function(error) {
    console.error('Failed to send subscription to server:', error);
  });
}

function init() {
  const savedUsername = localStorage.getItem('username');
  const chatIdFromUrl = getChatIdFromUrl();

  requestNotificationPermission()
    .then(subscribeUserToPush)
    .then(function(subscription) {
      return sendSubscriptionToServer(subscription);
    })
    .catch(function(err) {
      console.log('Failed to set up push notifications:', err);
    });

  console.log('Initializing app:', { savedUsername, chatIdFromUrl });

  updateChatList(); // Update the chat list in the UI

  if (savedUsername) {
    console.log('Emitting setUsername event');
    socket.emit('setUsername', savedUsername);
  }

  if (chatIdFromUrl && chatIdFromUrl !== '') {
    console.log('Chat ID found in URL');
    if (savedUsername) {
      console.log('Username found, joining chat');
      joinChat(chatIdFromUrl);
    } else {
      console.log('Username not found, showing username section');
      usernameSection.style.display = 'block';
      localStorage.setItem('pendingChatId', chatIdFromUrl);
    }
  } else if (savedUsername) {
    console.log('No chat ID in URL, showing join section');
    joinDiv.style.display = 'block';
  } else {
    console.log('No username or chat ID, showing username section');
    usernameSection.style.display = 'block';
  }

  updateChatList();
  registerServiceWorker();
  
  // Add event listeners
  document.getElementById('setUsername').addEventListener('click', setUsername);
  document.getElementById('createChat').addEventListener('click', createChat);
  document.getElementById('sendMessage').addEventListener('click', sendMessage);
  document.getElementById('leaveChat').addEventListener('click', leaveChat);
  document.getElementById('message').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

// Use a single DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', init);