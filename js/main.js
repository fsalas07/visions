// current day
const dateEl = document.getElementById('current-date');
const now = new Date();
const options = {weekday: 'long', month: 'long', day: 'numeric'};
dateEl.textContent = now.toLocaleDateString('en-US', options);