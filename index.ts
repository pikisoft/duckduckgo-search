// Define a type for the payload used in _getUrl and images/text methods
interface Payload {
  [key: string]: any;
}

// Define a type for the image result
interface ImageResult {
  title: string;
  image: string;
  thumbnail: string;
  url: string;
  height: number;
  width: number;
  source: string;
}

// Define a type for the text result
interface TextResult {
  title: string;
  href: string;
  body: string;
}

// Simulating the sleep function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simulating the httpx._exceptions.HTTPError class
class HTTPError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HTTPError";
  }
}

// Simulating the unescape function
function unescape(text: string): string {
  return text.replace(/&quot;/g, '"');
}

// Simulating the re.sub function
function sub(pattern: RegExp, replacement: string, text: string): string {
  return text.replace(pattern, replacement);
}

// Simulating the unquote function
function unquote(url: string): string {
  return url; // Simulating unquoting
}

const REGEX_STRIP_TAGS = /<[^>]*>/g;

// Simulating the main class
class SearchApi {
  logger: Console;

  constructor() {
    // Simulating the logger
    this.logger = console;
  }

  async *images(
    keywords: string,
    region: string = "wt-wt",
    safesearch: string = "moderate",
    timelimit: string | null = null,
    size: string | null = null,
    color: string | null = null,
    type_image: string | null = null,
    layout: string | null = null,
    license_image: string | null = null
  ): AsyncGenerator<ImageResult> {
    if (!keywords) {
      throw new Error("Keywords are mandatory");
    }

    const vqd = await this._getVqd(keywords);
    if (!vqd) {
      throw new Error("Error in getting vqd");
    }

    const safesearchBase: { [key: string]: number } = {
      on: 1,
      moderate: 1,
      off: -1,
    };
    const payload: Payload = {
      l: region,
      o: "json",
      s: 0,
      q: keywords,
      vqd: vqd,
      f: `${timelimit},${size},${color},${type_image},${layout},${license_image}`,
      p: safesearchBase[safesearch.toLowerCase()],
    };

    const cache = new Set<string>();
    for (let _ = 0; _ < 10; _++) {
      const resp = await this._getUrl(
        "GET",
        "https://duckduckgo.com/i.js",
        payload
      );

      if (!resp) {
        break;
      }

      try {
        const respJson = resp.data;
        const pageData = respJson.results;
        if (!pageData) {
          break;
        }

        let resultExists = false;
        for (const row of pageData) {
          const image_url = row.image;
          if (image_url && !cache.has(image_url)) {
            cache.add(image_url);
            resultExists = true;
            yield {
              title: row.title,
              image: this._normalizeUrl(image_url),
              thumbnail: this._normalizeUrl(row.thumbnail),
              url: this._normalizeUrl(row.url),
              height: row.height,
              width: row.width,
              source: row.source,
            };
          }
        }

        const next = respJson.next;
        if (next) {
          payload.s = next.split("s=")[1].split("&")[0];
        }

        if (!next || !resultExists) {
          break;
        }
      } catch (error) {
        break;
      }
    }
  }

  async *text(
    keywords: string,
    region: string = "wt-wt",
    safesearch: string = "moderate",
    timelimit: string | null = null
  ): AsyncGenerator<TextResult> {
    if (!keywords) {
      throw new Error("Keywords are mandatory");
    }

    const vqd = await this._getVqd(keywords);
    if (!vqd) {
      throw new Error("Error in getting vqd");
    }

    const payload: Payload = {
      q: keywords,
      kl: region,
      l: region,
      s: 0,
      df: timelimit,
      vqd: vqd,
      o: "json",
      sp: "0",
    };

    safesearch = safesearch.toLowerCase();
    if (safesearch === "moderate") {
      payload.ex = "-1";
    } else if (safesearch === "off") {
      payload.ex = "-2";
    } else if (safesearch === "on") {
      payload.p = "1";
    }

    const cache = new Set<string>();
    const searchPositions = ["0", "20", "70", "120"];

    for (const s of searchPositions) {
      payload.s = s;
      const resp = await this._getUrl(
        "GET",
        "https://links.duckduckgo.com/d.js",
        payload
      );

      if (!resp) {
        break;
      }

      try {
        const pageData = resp.data.results;
        if (!pageData) {
          break;
        }

        let resultExists = false;
        for (const row of pageData) {
          const href = row.u;
          if (
            href &&
            !cache.has(href) &&
            href !== `http://www.google.com/search?q=${keywords}`
          ) {
            cache.add(href);
            const body = this._normalize(row.a);
            if (body) {
              resultExists = true;
              yield {
                title: this._normalize(row.t),
                href: this._normalizeUrl(href),
                body: body,
              };
            }
          }
        }

        if (!resultExists) {
          break;
        }
      } catch (error) {
        break;
      }
    }
  }

  async _getUrl(
    method: string,
    url: string,
    params: Payload
  ): Promise<{ data: any } | null> {
    debugger;
    const queryString = Object.keys(params)
      .map(
        (key) => encodeURIComponent(key) + "=" + encodeURIComponent(params[key])
      )
      .join("&");
    const finalUrl = method === "GET" ? `${url}?${queryString}` : url;

    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch(finalUrl, {
          method: method,
          ...(params.o === "json"
            ? {
                headers: {
                  "Content-Type": "application/json",
                },
              }
            : {}),
          // headers: {
          //   "Content-Type": "application/json",
          // },
          body: method !== "GET" ? JSON.stringify(params) : undefined,
        });

        if (this._is500InUrl(response.url) || response.status === 202) {
          throw new HTTPError("");
        }
        const contentType = response.headers.get("Content-Type");
        console.log(contentType);

        if (response.status === 200) {
          // strategy is to assume that it's json first and then fallback to text
          debugger;
          try {
            if (response.headers.get("Content-Type")?.includes("text/html")) {
              const data = await response.text();
              return { data };
            }
          } catch (error) {
            // if it's not json, then it's text
          }
          try {
            if (
              response.headers.get("Content-Type")?.includes("application/json")
            ) {
              const data = await response.json();
              return { data };
            }
          } catch (error) {
            new Error("Response neither json nor text" + url);
          }
        }
      } catch (ex) {
        if (ex instanceof Error) {
          this.logger.warn(`_getUrl() ${url} ${ex.name} ${ex.message}`);
          if (i >= 2 || ex.message.includes("418")) {
            throw ex;
          }
        }
      }
      await sleep(3000);
    }
    return null;
  }

  async _getVqd(keywords: string) {
    try {
      const resp = await this._getUrl("GET", "https://duckduckgo.com", {
        q: keywords,
      });
      if (typeof resp?.data === "string") {
        for (const [c1, c2] of [
          ['vqd="', '"'],
          ["vqd=", "&"],
          ["vqd='", "'"],
        ]) {
          try {
            const start = resp.data.indexOf(c1) + c1.length;
            const end = resp.data.indexOf(c2, start);
            return resp.data.substring(start, end);
          } catch (error) {
            this.logger.warn(`_getVqd() keywords=${keywords} vqd not found`);
          }
        }
      }
    } catch (error) {
      console.error("eyyy", error);
      // Handle error
    }
    return null;
  }

  _is500InUrl(url: string): boolean {
    return url.includes("500");
  }

  _normalize(rawHtml: string): string {
    if (rawHtml) {
      return unescape(sub(REGEX_STRIP_TAGS, "", rawHtml));
    }
    return "";
  }

  _normalizeUrl(url: string): string {
    if (url) {
      return unquote(url).replace(" ", "+");
    }
    return "";
  }
}

export default new SearchApi();
