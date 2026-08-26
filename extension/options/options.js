const input = document.getElementById("apiUrl");
chrome.storage.sync.get({ apiUrl: "http://localhost:3000" }).then(({ apiUrl }) => { input.value = apiUrl; });
document.getElementById("save").addEventListener("click", async () => {
  const apiUrl = input.value.trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(apiUrl)) return document.getElementById("status").textContent = "Enter a valid HTTP or HTTPS URL.";
  await chrome.storage.sync.set({ apiUrl });
  document.getElementById("status").textContent = "Saved.";
});
