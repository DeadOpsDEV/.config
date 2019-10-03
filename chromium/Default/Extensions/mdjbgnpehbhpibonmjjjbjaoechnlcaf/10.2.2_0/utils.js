// Usefull utils

const timestamp = () => { return Math.floor(Date.now() / 1000); }

const time = (date) => {
	if(typeof date !== 'object')
		date = new Date();

	return date.getDate() + '/' + date.getMonth() + ' @ ' + date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds();
}

const capitalizeFirstLetter = (string) => { return string.charAt(0).toUpperCase() + string.slice(1); }

const exists = (variable) => { return (typeof(variable) != 'undefined'); }

const objForEach = (obj, callback) => {
  	for(var key in obj) {
	    // skip loop if the property is from prototype
	    if (!obj.hasOwnProperty(key)) continue;

	    callback(obj[key], key);
	}
};

const objLen = (obj) => {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) 
        	size++;
    }
    return size;
};

const to = (promise) => {
   return promise.then(data => {
      return [null, data];
   })
   .catch(err => [err]);
}

const sharedStart = (array) => {
	var A= array.concat().sort(), 
	a1= A[0], a2= A[A.length-1], L= a1.length, i= 0;
	while(i<L && a1.charAt(i)=== a2.charAt(i)) i++;
	return a1.substring(0, i);
}

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// i18n helper
const lang = (key) => {
	//return browser.i18n.getMessage(key);

	key = 'webext_' + key;

	if(!exists(env.langStore[key])) {
		log.warn('[LANG] Missing key', key);
		return key;
	}

	return env.langStore[key];
}

// set debug state
const setDebug = (enabled) => {
	if(enabled == true) {
		log.setLevel('trace');
		log.echo = true;
	} else {
		setupLoggingHistory();
	}
}


const slashEscape = (contents) => {
	if(typeof contents != 'string')
		return contents;

    return contents
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
}


const sendToAlld = async (links) => {
	browser.tabs.create({ url: 'https://alldebrid.' + env.config.domain + '/service/'})
	.then((tab) => {
		browser.tabs.executeScript(
			tab.id, 
			{code: "document.getElementById('links').value = '" + slashEscape(links) + "'; document.getElementById('giveMeMyLinks').click()"}
		).then( (result) =>  {
			if (browser.runtime.lastError)
				log.info('[FEAT] Error inserting posting CS', browser.runtime.lastError)
		});
	});
}

var humanFileSize = function(bytes) {
    
    if(lang('lang') == 'fr')
    	var units = ['octets', 'ko','Mo','Go','To','Po','Eo','Zo','Yo'];
    else
    	var units = ['Bytes', 'kB','MB','GB','TB','PB','EB','ZB','YB'];

    if(Math.abs(bytes) < 1024)
        return bytes + + ' ' + units[0];
    
    var u = 0;
    do {
        bytes /= 1024;
        ++u;
    } while(Math.abs(bytes) >= 1024 && u < units.length - 1);

    return bytes.toFixed(1) + ' ' + units[u];
}






// Get extension background env variables content for use in content scripts and popup
const getEnv = (key) => {
	var keyParts = key.split('.');
	var allowedVariables = ['config', 'user', 'options', 'langStore']; // Shared variables

	if(allowedVariables.indexOf(keyParts[0]) === -1)
		return false; // Not allowed

	var payload = env[keyParts[0]];

	if(keyParts.length == 1)
		return payload;

	keyParts.shift(); // Remove main key name, let's get requested subkey

	for(var i = 0, len = keyParts.length; i < len; i++) { // each level at a time
		if(!exists(payload[keyParts[i]]))// bad path
			continue;

		payload = payload[keyParts[i]];
	}

	return payload;
}

const isValidHostLink = (link)  => {

	// Strip https?:// from link
	var linkCleaned = link.replace(/(^\w+:|^)\/\/(www\.)?/, '');

	// If link not valid, early return
	if(typeof link !== 'string' || link == '') {
		log.info('[CORE] Invalid link', link);

	   return false;
	}

	// Get regexps
	var hosts = env.config.hosts.hostsRegexp;

	for(var host in hosts) {
		// Skip user disabled hosts
		if(env.options.disabledHosts == true && env.options.disabledHostsList.indexOf(host) != -1) {
			continue;
		}
		for(var reg in hosts[host]) {
			try {
				var regexp = hosts[host][reg];
				if(XRegExp(regexp).test(linkCleaned)){
					log.info('[CORE] Matched', linkCleaned, 'with', host, 'regexp', regexp);
					return true;
				}
			} catch (err) {
				log.warn('[CORE] Regexp error on', host, err, regexp);
				continue;	
			}
		}	
	}

	// Get regexps
	var folders = env.config.hosts.foldersRegexp;

	for(var folder in folders) {
		// Skip user disabled hosts
		if(env.options.disabledHosts == true && env.options.disabledHostsList.indexOf(folder) != -1) {
			continue;
		}
		for(var reg in folders[folder]) {
			try {
				var regexp = folders[folder][reg];
				if(XRegExp(regexp).test(linkCleaned)){
					log.info('[CORE] Matched', linkCleaned, 'with', folder, 'regexp', regexp);
					return true;
				}
			} catch (err) {
				log.warn('[CORE] Regexp error on', folder, err, regexp);
				continue;	
			}
		}	
	}

	// check enabled steam hosts
	if(env.options.enabledStream && env.options.enabledStreamList.length > 0) {

		var streams = env.options.enabledStreamList;
		
		for(var stream in streams) {
			for(var reg in env.config.hosts.streamRegexp[streams[stream]]) {
				try {
					var regexp = env.config.hosts.streamRegexp[streams[stream]][reg];
					if(XRegExp(regexp).test(link)){
						log.info('[CORE] Matched', link, 'with', stream, 'regexp', regexp);
						return true;
					}
				} catch (err) {
					log.warn('[CORE] Regexp error on', stream, err, regexp);
					continue;	
				}
			}
		}
	}

	return false;
}

// Get user client infos, to dynamically enable/disable features and make native messaging work smoothly.
const getClientInfos = async () => {

	let client = {};

	if(/opera|opr\/|opios/i.test(navigator.userAgent)) {
		client.nav = 'opera';
		client.agent = 'operaExt';
		client.features = {
			liveNotif: true, 
			extendedPattern: true, 
			autoCloseNotif: true
		};
	} else if(/edg([ea]|ios)/i.test(navigator.userAgent)) {
		client.nav = 'edge';
		client.agent = 'edgeExt';
		client.features = {
			liveNotif: false, 
			extendedPattern: false, 
			autoCloseNotif: false
		};
	} else if(/firefox|iceweasel|fxios/i.test(navigator.userAgent)) {
		client.nav = 'ff';
		client.agent = 'ffExt';
		client.version = +(/Firefox\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];
		client.features = {
			liveNotif: false, // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/notifications/NotificationOptions
			extendedPattern: false, 
			autoCloseNotif: true
		};
		if(client.version > 63) // https://bugzilla.mozilla.org/show_bug.cgi?id=1280370#c38
			client.features.extendedPattern = true;
	} else /*if(chrome|crios|crmo/i.test(navigator.userAgent)) */ {
		client.nav = 'chrome';
		client.agent = 'chromeExt';
		client.version = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];
		client.features = {
			liveNotif: true, 
			extendedPattern: true, 
			autoCloseNotif: false
		};
	}

	// Needed for local streaming via native messaging
	if(navigator.userAgent.indexOf('Mac') !== -1)
		client.os = 'mac'
	else if (navigator.userAgent.indexOf('Linux') !== -1)
		client.os = 'linux'
	else
		client.os = 'win'


	let manifest = chrome.runtime.getManifest(); 
	client.version = manifest.version;


	client.localStream = await native.getVersion();

	return client;
}












// Basic notif
var notifTimeouts = {};

const notification = async (title, message, id) => {
	var notifOpts = {
		"type" : "basic",
		"title": title,
		"message": message,
		"iconUrl": env.config.imgs.logo
	};

	if(id != null) {
		browser.notifications.create(id, notifOpts).then((notificationId) => {
			// Manually clear notif is not browser auto-close
			if(env.config.client.features.autoCloseNotif == false) {
				// Save manual hide timeout, if river finish before 3500 and we update it with complete status, we disable the hiding
				var timeout = setTimeout(function() {browser.notifications.clear(notificationId); delete notifTimeouts[notificationId];}, 3500);
				notifTimeouts[notificationId] = timeout; 
			}
		}).catch((error) => { log.error(error)});
	} else {
		browser.notifications.create(notifOpts).then((notificationId) => {
			// Manually clear notif is not browser auto-close
			if(env.config.client.features.autoCloseNotif == false) {
				// Save manual hide timeout, if river finish before 3500 and we update it with complete status, we disable the hiding
				var timeout = setTimeout(function() {browser.notifications.clear(notificationId); delete notifTimeouts[notificationId]; }, 3500);
				notifTimeouts[notificationId] = timeout;
			}
		}).catch((error) => { log.error(error)});
	}

		
}

// Live notif with live updating informations and progressbar where supported
const liveNotification = (id, progress, title, message, links) => {

	// If user has manually closed this notification and we don't have the final links, do nothing 
	if(!links && env.config.rivers.closedNotif.indexOf(id) !== -1) {
		return;
	}

	if(links && exists(notifTimeouts[id])) { 
		// Prevent simple notif timeout to clear a completed rich notification with links
		clearTimeout(notifTimeouts[id]);
		delete notifTimeouts[id];
	}


	if(message.length > 36)
		message = message.substr(0, 33) + "...";

	var opt = {
		progress: Math.max(0, progress),
		type: "progress",
		iconUrl: env.config.imgs.logo,
		title: title,
		message: message,
		isClickable: false,
		requireInteraction: true
	};

	// Display  quick download or open buttons
	if(links) {
		if(Array.isArray(links)) {
			opt.buttons = [{title: chrome.i18n.getMessage("ykw_open_on_alld")}];
		} else {
			opt.buttons = [{title: chrome.i18n.getMessage("ykw_open_utb_link")}, {title: chrome.i18n.getMessage("ykw_open_on_alld")}];
		}	
	}


	if(env.config.rivers.liveNotif.indexOf(id) == -1) {
		// New live notif, let's add it to track its status elsewhere
		env.config.rivers.liveNotif.push(id);
		console.log(progress, opt);
		chrome.notifications.create('river-' + id, opt);
	} else {
		browser.notifications.update('river-' + id, opt);
	}
}
const getRandomInt = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}