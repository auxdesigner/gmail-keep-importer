
/*********************************** GMAIL ***********************************/

(function() {

    var LPMail = {

        checkAuthSilent: prepareAuthWithCallbacks(true),
checkAuthClick: prepareAuthWithCallbacks(false),

/**
 * Initiate message fetching.
 */
importGMailLabel: function(label, cbFn, cbErrorFn) {
    console.info(':: Starting importing messages for label: ', label);
    try {
        listMessagesWrapper(label, cbFn);
    } catch(e) {
        cbErrorFn(e);
    } finally {
        console.info(':: Finished importing messages for label: ', label);
    }
}

};

// Your Client ID can be retrieved from your project in the Google
// Developer Console, https://console.developers.google.com
var CLIENT_ID = '242163669253-u4fmahm4dklc3b1l42paf29netvs5to5.apps.googleusercontent.com'; // CHROME STORE
//var CLIENT_ID = '242163669253-6cjg35vha2ghq2fkre864fb79o8a8n6o.apps.googleusercontent.com'; // CHROME - DEV
//var CLIENT_ID = '242163669253-vhppkeaedtsk7gvs92ibvh2nrl79f6nk.apps.googleusercontent.com'; // mac dev
var SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'].join(' ');

/**
 * Initiate auth flow in response to user clicking authorize button.
 * Called when the user clicks the button to Authorize the plugin and when the Google client is loaded.
 */
function prepareAuthWithCallbacks(immediate) {
    return function(cbFn, cbErrorFn) {
        gapi.auth.authorize({
            'client_id': CLIENT_ID,
            'scope': SCOPES,
            'immediate': immediate
        }, prepareAuthHandlerWithCallbacks(cbFn, cbErrorFn));
    };
}

/**
 * Handle response from authorization server.
 *
 * @param {Object} authResult Authorization result.
 */
function prepareAuthHandlerWithCallbacks(cbFn, cbErrorFn) {
    return function(authResult) {
        if (authResult && !authResult.error) {
            console.info('User authenticated! Preparing to load Gmail API...');
            loadGmailApi(cbFn, cbErrorFn);
        } else {
            console.error('User authenticated! Preparing to load Gmail API...');
            console.error(authResult);
            cbErrorFn(authResult.error);
        }
    };
}

/**
 * Load Gmail API client library. List labels once client library
 * is loaded.
 */
function loadGmailApi(cbFn, cbErrorFn) {
    gapi.client.load('gmail', 'v1', function() {
        // gmail api loaded - do stuff now.
        if (!gapi.client.gmail || !gapi.client.gmail.users) {
            console.error('GMAIL API DID NOT LOAD!!!');
            cbErrorFn('Gmail API DID NOT load!!!');
            return;
        }
        console.info('Gmail API loaded!');
        cbFn('Gmail API loaded!');
    });
}

// Final callback with the final messages.
// Will call the callback with all the messages from Gmail that have content 
// and are of the specified label.
function buildDecoratedMessagesHandler(cbFn) {
    return function handleLabelMessages(messages) {
        console.log('Decorating finished!');
        console.log(messages);
        // send the messages to the content-script.
        cbFn(messages.filter(function(msg) { return !!msg.decodedPayload; }));
    };
}

/**
 * Starts the fetching of the messages from GMail.
 */
function listMessagesWrapper(label, cbFn) {
    listMessages('me', label, function(messages) {
        //console.log(messages);
        console.log('Received messages from label: ', label);
        console.log('Decorating the messages with decoded body...', messages.length);
        decorateMessages('me', messages, buildDecoratedMessagesHandler(cbFn));
    });
}

/**
 * Retrieve Messages in user's mailbox matching query.
 *
 * @param  {String} userId User's email address. The special value 'me'
 * can be used to indicate the authenticated user.
 * @param  {String} query String used to filter the Messages listed.
 * @param  {Function} callback Function to call when the request is complete.
 */
function listMessages(userId, query, callback) {
    var getPageOfMessages = function(request, result) {
        request.execute(function(resp) {
            if (!resp.messages || resp.messages.length === 0) { callback(result); return; }
            result = result.concat(resp.messages);
            var nextPageToken = resp.nextPageToken;
            if (nextPageToken) {
                request = gapi.client.gmail.users.messages.list({
                    'userId': userId,
                    'pageToken': nextPageToken,
                    'q': 'label:' + query
                });
                getPageOfMessages(request, result);
            } else {
                callback(result); return;
            }
        });
    };
    var initialRequest = gapi.client.gmail.users.messages.list({
        'userId': userId,
        'q': 'label:' + query
    });
    getPageOfMessages(initialRequest, []);
}

/*
 * Queries the GMail API for the full content of each message given.
 * It adds to the final messages the Base64 decoded body message.
 */
function decorateMessages(userId, messages, callback) {
    console.log(messages);
    if (!messages || messages.length === 0) { console.log("No messages"); callback([]); return; }
    var i = 0;
    var totalMessages = messages.length;

    var getMessage = function(request, result) {
        request.execute(function(resp) {
            result[i].email = resp;
            var part = extractBodyPayload(resp);
            if (!!part) {
                result[i].decodedPayload = part;
                //console.log(part);
            }
            i += 1;
            var finished = i === totalMessages;
            if (!finished) {
                var currentMessage = result[i];
                request = gapi.client.gmail.users.messages.get({
                    'userId': userId,
                        'id': currentMessage.id,
                        'format': 'full'
                });

                getMessage(request, result);
            } else {
                callback(result);
            }
        });
    };
    var initialRequest = gapi.client.gmail.users.messages.get({
        'userId': userId,
        'id': messages[0].id,
        'format': 'full'
    });
    getMessage(initialRequest, messages);
}

function extractBodyPayload(email) {
    payload = extractBodyPayloadMime(email.payload);
    if (payload && payload.body && payload.body.size && payload.body.size > 0) {
        if (payload.mimeType.toLowerCase() === "text/plain") {
            return convertPlainToText(payload.body.data);
        } else if (payload.mimeType.toLowerCase() === "text/html") {
            return convertHtmlToText(payload.body.data);
        }   
    }
    return null;
}

function extractBodyPayloadMime(payload) {
    //console.info(payload, mimeType);
    if ((payload.mimeType.toLowerCase() === "text/html") || (payload.mimeType.toLowerCase() === "text/plain")) {
        return payload;
    } else if ((payload.mimeType.toLowerCase().indexOf("multipart") === 0) && payload.parts) {
        var validParts = payload.parts.map(function(part) {
            return extractBodyPayloadMime(part);
        }).filter(function(payload) {
            return !!payload;
        });
        //console.log('Valid parts', validParts);
        if (validParts && validParts.length > 0) {
            return validParts[0];
        } else {
            return null;
        }
    }
    console.info('Unsupported email response format!', payload);
    return null;
}

function convertPlainToText(plainText64) {
    return B64.decode(plainText64);
}

function convertHtmlToText(htmlText64) {
    if (!htmlText64) { return ''; }
    var div = document.createElement('div');
    div.innerHTML = B64.decode(htmlText64) || '';
    return div.innerText;
}

this.LPMail = LPMail;

}).call(this);
