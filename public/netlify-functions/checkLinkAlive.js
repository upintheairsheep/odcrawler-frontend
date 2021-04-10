const http = require(`http`);
const https = require(`https`);
const fetch = require(`node-fetch`);
const AbortController = require(`abort-controller`);

const httpAgent = new http.Agent({
  rejectUnauthorized: false,
});
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

// https://stackoverflow.com/a/57888548/5485777
const fetchTimeout = (url, ms, options = {}) => {
  const controller = new AbortController();
  const promise = fetch(url, { signal: controller.signal, ...options });
  const timeout = setTimeout(() => controller.abort(), ms);
  return promise.finally(() => clearTimeout(timeout));
};

function resolveLink(url) {

  let resolvedUrl = url;
  let resolvedHeaders = {};

  if (url.includes(`driveindex.ga/`)) {
    resolvedUrl = resolvedUrl.replace(`driveindex.ga/`, `hashhackers.com/`);
    resolvedHeaders = {
      'referer': `hashhackers.com`,
    }
  }
  
  return {
    originalUrl: url,
    url: resolvedUrl,
    headers: resolvedHeaders,
  };
  
}

function checkLink(urlData) {
  return new Promise((resolve) => {
  
    fetchTimeout(urlData.url, 9500, {
      method: `HEAD`,
      headers: urlData.headers,
      agent: function (_parsedURL) {
        return _parsedURL.protocol === 'https:' ? httpsAgent : httpAgent;
      }
    }).then(res => {
  
      return resolve({
        statusCode: res.status,
        isAlive: res.ok,
        sizeInBytes: res.headers.get(`Content-Length`) === null ? NaN : Number(res.headers.get(`Content-Length`)),
        url: urlData.originalUrl,
        checkedUrl: urlData.url,
        headers: urlData.headers,
      });
      
    }).catch(err => {
  
      console.warn(`Request failed:`, err);
      console.log(`urlData.url:`, urlData.url)
      
      return resolve({
        statusCode: 504, // gateway timeout
        body: err.message,
        url: urlData.originalUrl,
      });
      
    })
  
  })
  
}

exports.handler = function(event, context, callback) {

  if (event.httpMethod !== `POST`) {
    return callback(null, {
      statusCode: 405,
      body: `Method not allowed!`,
    })
  }
  
  let parsedBody;
  try {
    parsedBody = JSON.parse(event.body);
  } catch (err) {
    return callback(err, {
      statusCode: 500,
      body: err.message,
    })
  }

  if (!parsedBody.urls || parsedBody.urls.length === 0) {
    return callback(null, {
      statusCode: 400,
      body: `You need to provide at least one valid url! Received ${parsedBody}, ${parsedBody.url}`,
    })
  }

  let responseBody = {
    results: new Array(parsedBody.urls.length),
  }

  let requests = [];
  for (let i = 0; i < parsedBody.urls.length; i++) {

    const urlToCheck = parsedBody.urls[i];
    
    let resolvedUrlData = resolveLink(urlToCheck);
    requests.push(checkLink(resolvedUrlData).then(result => {
      responseBody.results[i] = result;
    }))
    
  }

  Promise.all(requests).then(() => {

    return callback(null, {
      statusCode: 200,
      body: JSON.stringify(responseBody),
    });
    
  })
  
}