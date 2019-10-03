var webCallbacks = {}

function alldSendMessage(payload, callback) { // Send message to Alld extension, via Custom Event.
	if(!callback)
		callback = function() {};
    var reqId = Math.random().toString(36).slice(2); // unique ID for this request
    var fetchEvent = new CustomEvent('alldCommand', {"detail": {"payload":payload, "reqId":reqId}});

    webCallbacks[reqId] = callback
    document.dispatchEvent(fetchEvent);
}

document.addEventListener('alldResponse', function (event) {

    if(typeof webCallbacks[event.detail.reqId] == 'undefined')
	    return; // Not for us

	var callback = webCallbacks[event.detail.reqId];

    callback(event.detail.payload);
})

var alldMessagingLoaded = new CustomEvent('alldMessagingLoaded');
document.dispatchEvent(alldMessagingLoaded);