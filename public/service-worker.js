self.addEventListener('push', function(event) {
  console.log('Push event received', event);
  if (event.data) {
    const data = event.data.json();
    console.log('Push event data:', data);
    const options = {
      body: data.body,
      icon: '/icon.png',
      badge: '/badge.png',
      sound: '/sounds/notification.mp3'  // Keep this for browsers that support it
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
        .then(() => {
          console.log('Notification shown');
          // Try to play sound using Audio API
          return playNotificationSound();
        })
        .then(() => console.log('Notification sound played'))
        .catch(error => console.error('Error showing notification or playing sound:', error))
    );
  } else {
    console.log('Push event received but no data');
  }
});

function playNotificationSound() {
  return new Promise((resolve, reject) => {
    const audio = new Audio('/sounds/notification.mp3');
    audio.onended = resolve;
    audio.onerror = reject;
    audio.play().catch(reject);

    // Fallback for browsers that don't support audio playback in service workers
    setTimeout(resolve, 1000);
  });
}

self.addEventListener('notificationclick', function(event) {
  console.log('Notification click received', event);
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});