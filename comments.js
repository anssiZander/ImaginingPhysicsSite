(() => {
  const commentsRoot = document.querySelector("[data-comments]");
  if (!commentsRoot) return;

  const status = document.createElement("p");
  status.className = "comments-status";
  commentsRoot.append(status);

  if (!["http:", "https:"].includes(window.location.protocol)) {
    status.textContent = "Comments load when this post is viewed on the published site.";
    return;
  }

  status.textContent = "Loading comments...";
  commentsRoot.setAttribute("aria-busy", "true");

  const script = document.createElement("script");
  script.src = "https://utteranc.es/client.js";
  script.setAttribute("repo", "anssiZander/ImaginingPhysicsSite");
  script.setAttribute("issue-term", "pathname");
  script.setAttribute("theme", commentsRoot.dataset.theme || "github-light");
  script.setAttribute("crossorigin", "anonymous");
  script.async = true;

  script.addEventListener("load", () => {
    status.remove();
    commentsRoot.removeAttribute("aria-busy");
  });

  script.addEventListener("error", () => {
    status.textContent = "The comment section could not be loaded. Please try again later.";
    commentsRoot.removeAttribute("aria-busy");
  });

  commentsRoot.append(script);
})();
