async function recaptchaV2({ domain, proxy, siteKey, action = "submit", isInvisible = false }, page) {
  if (!domain) throw new Error("Missing domain parameter");
  if (!siteKey) throw new Error("Missing siteKey parameter");

  const timeout = global.timeOut || 60000;
  let isResolved = false;

  const cl = setTimeout(async () => {
    if (!isResolved) {
      throw new Error("Timeout Error");
    }
  }, timeout);

  try {
    if (proxy?.username && proxy?.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password,
      });
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>reCAPTCHA v2 Solver</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: #f5f5f5;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
          }
          .status {
            margin-top: 20px;
            padding: 10px;
            border-radius: 5px;
            background: #f8f9fa;
          }
          button {
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin: 10px;
          }
          button:hover {
            background: #0056b3;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>reCAPTCHA v2 Solver</h2>
          <p>SiteKey: ${siteKey}</p>
          <div id="recaptcha-container">
            <div class="g-recaptcha"
                 data-sitekey="${siteKey}"
                 data-callback="recaptchaCallback"
                 data-expired-callback="recaptchaExpired"
                 data-error-callback="recaptchaError"
                 data-size="${isInvisible ? 'invisible' : 'normal'}"
                 data-theme="light">
            </div>
          </div>
          ${isInvisible ? '<button onclick="executeInvisible()">Execute reCAPTCHA</button>' : ''}
          <button onclick="checkToken()">Check Token</button>
          <div class="status" id="status">Waiting for reCAPTCHA...</div>
        </div>

        <script>
          // Global variables
          window.recaptchaToken = null;
          window.recaptchaSolved = false;

          // Callback functions
          window.recaptchaCallback = function(token) {
            console.log('reCAPTCHA token received:', token);
            window.recaptchaToken = token;
            window.recaptchaSolved = true;
            
            document.getElementById('status').innerHTML = '✅ reCAPTCHA Solved! Token: ' + token.substring(0, 20) + '...';
            document.getElementById('status').style.background = '#d4edda';
            document.getElementById('status').style.color = '#155724';
            
            // Store token in multiple ways
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'g-recaptcha-response';
            input.value = token;
            input.id = 'recaptcha-token-input';
            document.body.appendChild(input);
            
            localStorage.setItem('recaptcha_token', token);
          };

          window.recaptchaExpired = function() {
            console.log('reCAPTCHA expired');
            window.recaptchaToken = null;
            window.recaptchaSolved = false;
            document.getElementById('status').innerHTML = '❌ reCAPTCHA Expired - Refreshing...';
            document.getElementById('status').style.background = '#fff3cd';
            document.getElementById('status').style.color = '#856404';
            
            var existing = document.getElementById('recaptcha-token-input');
            if (existing) existing.remove();
            
            // Auto-refresh after expiration
            setTimeout(() => {
              if (window.grecaptcha) {
                grecaptcha.reset();
              }
            }, 1000);
          };

          window.recaptchaError = function() {
            console.log('reCAPTCHA error');
            document.getElementById('status').innerHTML = '❌ reCAPTCHA Error';
            document.getElementById('status').style.background = '#f8d7da';
            document.getElementById('status').style.color = '#721c24';
          };

          window.executeInvisible = function() {
            if (window.grecaptcha) {
              grecaptcha.execute();
            }
          };

          window.checkToken = function() {
            const token = window.recaptchaToken || document.getElementById('recaptcha-token-input')?.value;
            if (token) {
              document.getElementById('status').innerHTML = 'Token: ' + token;
            } else {
              document.getElementById('status').innerHTML = 'No token yet';
            }
          };

          // Auto-execute for invisible reCAPTCHA
          window.onload = function() {
            setTimeout(function() {
              // For invisible reCAPTCHA, auto-execute
              if (${isInvisible} && window.grecaptcha) {
                grecaptcha.execute();
              }
              
              // For visible reCAPTCHA, try to find and click
              if (!${isInvisible}) {
                var iframe = document.querySelector('iframe[src*="recaptcha"]');
                if (iframe) {
                  console.log('Attempting to interact with reCAPTCHA');
                  var rect = iframe.getBoundingClientRect();
                  var clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2
                  });
                  iframe.dispatchEvent(clickEvent);
                }
              }
            }, 2000);
          };
        </script>

        <!-- Load reCAPTCHA API -->
        <script src="https://www.google.com/recaptcha/api.js" async defer></script>
      </body>
      </html>
    `;

    // Setup request interception
    await page.setRequestInterception(true);
    page.removeAllListeners("request");
    
    page.on("request", async (request) => {
      const url = request.url();
      
      // Handle main document request
      if ([domain, domain + "/"].includes(url) && request.resourceType() === "document") {
        await request.respond({
          status: 200,
          contentType: "text/html",
          body: htmlContent,
        });
      }
      // Block unnecessary resources untuk mempercepat
      else if (request.resourceType() === 'image' || 
               request.resourceType() === 'stylesheet' ||
               request.resourceType() === 'font') {
        await request.abort();
      }
      else {
        await request.continue();
      }
    });

    // Navigate ke page
    await page.goto(domain, { 
      waitUntil: "domcontentloaded",
      timeout: timeout 
    });

    // Tunggu reCAPTCHA container load
    await page.waitForSelector('.g-recaptcha', { timeout: 10000 });

    // Tunggu token tersedia dengan multiple strategies
    const token = await page.waitForFunction(() => {
      // Cek dari hidden input
      const input = document.querySelector('#recaptcha-token-input');
      if (input && input.value && input.value.length > 10) {
        return input.value;
      }
      
      // Cek dari localStorage
      const stored = localStorage.getItem('recaptcha_token');
      if (stored && stored.length > 10) {
        return stored;
      }
      
      // Cek dari global variable
      if (window.recaptchaToken && window.recaptchaToken.length > 10) {
        return window.recaptchaToken;
      }
      
      return null;
    }, { timeout, polling: 100 });

    const tokenValue = await token.jsonValue();
    
    isResolved = true;
    clearTimeout(cl);

    if (!tokenValue || tokenValue.length < 10) {
      throw new Error("Failed to get valid reCAPTCHA token");
    }

    console.log('Successfully obtained reCAPTCHA token');
    return { token: tokenValue, type: 'recaptcha_v2' };

  } catch (error) {
    clearTimeout(cl);
    
    // Fallback: coba ambil token dengan method lain
    try {
      const fallbackToken = await page.evaluate(() => {
        const input = document.querySelector('#recaptcha-token-input');
        return input ? input.value : null;
      });
      
      if (fallbackToken && fallbackToken.length > 10) {
        return { token: fallbackToken, type: 'recaptcha_v2' };
      }
    } catch (e) {
      // Ignore fallback error
    }
    
    throw new Error(`reCAPTCHA solving failed: ${error.message}`);
  }
}

module.exports = recaptchaV2;