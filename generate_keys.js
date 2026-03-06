(async () => {
  const fs = await import('node:fs');
  const { default: webpush } = await import('web-push');
  const vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync('keys.json', JSON.stringify(vapidKeys, null, 2), 'utf8');
  console.log('Keys generated');
})();
  