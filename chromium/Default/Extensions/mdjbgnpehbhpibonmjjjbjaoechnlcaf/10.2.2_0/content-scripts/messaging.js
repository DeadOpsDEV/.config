if(!window.alldExtensionMessaging) {
    window.alldExtensionMessaging = true;

    var csCallbacks = {}

    if(typeof cloneInto !== "function") { // Shim for Chrome-based browsers
    	var cloneInto = function(payload, target) { return payload; }
    }

    // Listen to webpage-side event
    document.addEventListener('alldCommand', function(event) {
    	// Forward Alld command to extension
    	chrome.runtime.sendMessage(event.detail.payload, function(response) {
    		// Forward Alld response to extension

	   		// Firefox need to expose the event payload, need this stuff
	   		var payload = cloneInto({"payload":response, "reqId": event.detail.reqId}, document.defaultView);
	    	var alldResponse = new CustomEvent('alldResponse', {"detail": payload});
	    	document.dispatchEvent(alldResponse);
		})
	});

	function alldSendMessage(payload, callback) { // Send message to Alld extension, via Custom Event.
		if(!callback)
			callback = function() {};
	    var reqId = Math.random().toString(36).slice(2); // unique ID for this request
	    var fetchEvent = new CustomEvent('alldCommand', {"detail": {"payload":payload, "reqId":reqId}});

	    csCallbacks[reqId] = callback
	    document.dispatchEvent(fetchEvent);
	}

	document.addEventListener('alldResponse', function (event) {

		if(typeof csCallbacks[event.detail.reqId] == 'undefined')
	    	return; // Not for us

	    var callback = csCallbacks[event.detail.reqId];

	    callback(event.detail.payload);
	});

	// Expose same functionnality to javascript website-side
	var s = document.createElement('script');
	s.src = chrome.extension.getURL("web-scripts/messaging.js");
	document.documentElement.appendChild(s);
}

undefined;