async function turnstile({ domain, proxy, siteKey }, page) {
  if (!domain) throw new Error("Missing domain parameter");
  if (!siteKey) throw new Error("Missing siteKey parameter");

  const timeout = global.timeOut || 60000;
  let isResolved = false;
  let timer;

  // Promise yang reject saat timeout, bisa ditangkap try/catch
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (!isResolved) reject(new Error("Timeout Error"));
    }, timeout);
  });

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
      <body>
        <div class="turnstile"></div>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback" defer></script>
        <script>
          window.onloadTurnstileCallback = function () {
            turnstile.render('.turnstile', {
              sitekey: '${siteKey}',
              callback: function (token) {
                var c = document.createElement('input');
                c.type = 'hidden';
                c.name = 'cf-response';
                c.value = token;
                document.body.appendChild(c);
              },
            });
          };
        </script>
      </body>
      </html>
    `;

    await page.setRequestInterception(true);
    page.removeAllListeners("request");
    page.on("request", async (request) => {
      if ([domain, domain + "/"].includes(request.url()) && request.resourceType() === "document") {
        await request.respond({
          status: 200,
          contentType: "text/html",
          body: htmlContent,
        });
      } else {
        await request.continue();
      }
    });

    // Balapan antara proses utama dan timeout
    const token = await Promise.race([
      (async () => {
        await page.goto(domain, { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[name="cf-response"]', { timeout });
        return await page.evaluate(() => {
          try {
            return document.querySelector('[name="cf-response"]').value;
          } catch {
            return null;
          }
        });
      })(),
      timeoutPromise,
    ]);

    isResolved = true;
    clearTimeout(timer);

    if (!token || token.length < 10) throw new Error("Failed to get token");
    return token;

  } catch (e) {
    isResolved = true;
    clearTimeout(timer);
    throw e;
  }
}

module.exports = turnstile;
