(function () {
  var prefix = "__text_mode_";
  var selector = "[class*='" + prefix + "']";
  var originalError = console.error;
  console.error = function () {
    var message = Array.prototype.slice.call(arguments).join(" ");
    if (message.indexOf("A tree hydrated") >= 0 && message.indexOf(prefix) >= 0) return;
    return originalError.apply(console, arguments);
  };
  var cleanElement = function (element) {
    if (!element || element.nodeType !== 1 || !element.classList) return;
    Array.prototype.slice.call(element.classList).forEach(function (className) {
      if (className.indexOf(prefix) === 0) element.classList.remove(className);
    });
    if (!element.getAttribute("class")) element.removeAttribute("class");
  };
  var cleanTree = function (root) {
    cleanElement(root);
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(selector).forEach(cleanElement);
  };
  cleanTree(document.documentElement);
  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      if (record.type === "attributes") cleanElement(record.target);
      record.addedNodes.forEach(function (node) {
        cleanTree(node);
      });
    });
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true
  });
  var finish = function () {
    cleanTree(document.documentElement);
    window.setTimeout(function () {
      cleanTree(document.documentElement);
      observer.disconnect();
    }, 1500);
  };
  if (document.readyState === "loading") {
    document.addEventListener("readystatechange", function () {
      if (document.readyState === "interactive") cleanTree(document.documentElement);
    });
    document.addEventListener("DOMContentLoaded", finish, { once: true });
  } else {
    finish();
  }
})();
