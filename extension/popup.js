console.log('popup.js is loaded');

var port = chrome.runtime.connect({ name: 'popupToBackground' });
console.log('Port established:', port);

function initApp() {
  document.getElementById('sharePublic').addEventListener('click', sharePublic);
  console.log('initApp');
}

function sharePublic() {
  console.log('sharePublic function called');
  document.querySelector('#sharePublicLoader').style.display = 'flex';
  document.querySelector('#sharePublic').style.display = 'none';
  scrape();
  setTimeout(() => {
    document.querySelector('#sharePublicLoader').style.display = 'none';
    document.querySelector('#sharePublic').style.display = 'flex';
  }, 10000);
}

const scrape = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0]?.id, { action: 'scrape' }, function (_) {
      console.log('sendData scrape Done');
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        document.querySelector('#sharePublicLoader').style.display = 'none';
        document.querySelector('#sharePublic').style.display = 'flex';
      }
    });
  });
};

chrome.tabs.query({ active: true, currentWindow: true, url: 'https://bard.google.com/*' }, (tabs) => {
  if (tabs?.length) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'model', model: 'Bard' }, function (_) {
      console.log('is Bard');
    });
  }
});
chrome.tabs.query({ active: true, currentWindow: true, url: 'https://www.meta.ai/*' }, (tabs) => {
  if (tabs?.length) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'model', model: 'Meta' }, function (_) {
      console.log('is Meta');
    });
  }
});
chrome.tabs.query({ active: true, currentWindow: true, url: 'https://claude.ai/*' }, (tabs) => {
  if (tabs?.length) {
    chrome.tabs.sendMessage(tabs[0].id, { action: 'model', model: 'Claude' }, function (_) {
      console.log('is Claude');
    });
  }
});

window.onload = initApp;
