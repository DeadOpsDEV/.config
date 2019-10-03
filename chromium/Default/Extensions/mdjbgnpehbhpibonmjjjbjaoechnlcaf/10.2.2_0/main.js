// Main env variable, accessible everywhere
var env = {
	'user': {},
	'options': {},
	'config': {
		boot: false,
		debug: true,
		apiUrl: 'https://api.alldebrid.com/',
		apiSlowUrl: 'https://apislow.alldebrid.com/',
		alldDomains: ['alldebrid.com', 'alldebrid.fr', 'alldebrid.org', 'alldebrid.de', 'alldebrid.it', 'alldebrid.es'],
		token: '',
		domain: 'com',
		isLoggued: false,
		client: false,
		hosts: {},
		rivers: {
			list: false,
			session: getRandomInt(1, 100000),
			hasRunning: false,
			running: {},
			liveNotif: [],
			closedNotif: [],
			links: {},
			isLearning: false,
			learnLinks: [],
			lastUpdate: timestamp() - 3600
		},
		imgs: {
			'logo': browser.runtime.getURL('/img/logo.png'),
			'blackbarBlock': browser.runtime.getURL('/img/block_head.png'),
			'alldLogo': browser.runtime.getURL('/img/logo_alldebrid.png'),
			'icon': browser.runtime.getURL('/img/icon.png')
		},
		hiddenID: '', // for hardRedirection hosts
		lastSource: '',
		disabledSourceID: '',
		contextUnlock: false,
		currentSelection: false,
		currentTab: false,
		tabLinks: {},
		tabFiles: {},
		tabFilesProcessing: {},
	},
	langStore: {}
}

setDebug(false);

browser.browserAction.setBadgeBackgroundColor({color: '#d44141'});

// Ok let's go
(async function() {

	env.config.client = await getClientInfos();

	var localDataVersion = await storage.get('localDataVersion');

	// Check if upgrading from < 10 extension
	if(localDataVersion == undefined) {
		var oldOptions = await storage.get('userPref');

		if(oldOptions && exists(oldOptions.autoPopup)) {
			// User migrated from old version of extension, let's migrate the user pref
			var newOptions = {
				disabledHosts: true,
				disabledHostsList: [],
				enabledStream: false,
				enabledStreamList: [],
				changeLink: oldOptions.changeLink,
				blackBar: oldOptions.blackBar,
				autoPopup: oldOptions.autoPopup,
				findPageLinks: oldOptions.findPageLinks,
				riverLiveNotif: oldOptions.ykwProgressDisplay,
				riverCompletionNotif: oldOptions.ykwCompletionDisplay,
				replaceStreamSource: true,
				riverCustomSource: false,
				customSources: [],
				localPlayer: '',
				localPlayerPath: ''
			};
			log.info('[CORE] Migrating old config', newOptions);
			await storage.set({options: newOptions});
		}
		storage.set({localDataVersion: 1});
	} 

	// Init extension, aka get lang data, user and user prefs from local storage
	env.langStore = await storage.get('langStore');

	if(typeof env.langStore != 'object')
		await refreshLangStore();

	env.user = (await storage.get('user')) || {};
	env.options = (await storage.get('options')) || { 
		disabledHosts: true,
		disabledHostsList: [],
		enabledStream: false,
		enabledStreamList: [],
		changeLink: false,
		blackBar: true,
		autoPopup: true,
		findPageLinks: true,
		riverLiveNotif: true,
		riverCompletionNotif: true,
		replaceStreamSource: true,
		riverCustomSource: false,
		customSources: [],
		localPlayer: '',
		localPlayerPath: ''
	};

	// Added in v. 10.2.0
	if(!exists(env.options.findPageLinks))
		env.options.findPageLinks = true;

	// Setup cs listener even if not loggued, need communication script
	setupContentScripts();

	// Check if user is loggued
	var [error, isLoggued] = await api.login(true);

	if(!isLoggued) {
		log.warn('[USER] Not loggued', error);
		notification(lang("notif_not_loggued"), lang("notif_not_loggued_desc"));
		return;
	}

	storage.set({config: env.config});

	// Bootstrap extension once loggued
	log.info('[CORE] First bootstrap');
	await bootstrap();

	if(env.config.client.features.liveNotif == true) {
		// Advanced notification button where available
		chrome.notifications.onButtonClicked.addListener( (notificationId, buttonIndex) => {
			if(notificationId.indexOf('river-') === 0) {
				riverID = parseInt(notificationId.substring(6));
				log.info('[RIVERS] Real ID', notificationId, riverID, env.config.rivers.links);
				// React to 'open link' buttons
				if(exists(env.config.rivers.links[riverID])) {
					var links = env.config.rivers.links[riverID];
					if(buttonIndex == 0) {
						// Send links to Alld
						if(Array.isArray(links)) {
							var postData = '';

							links.forEach(function(link) {
								postData = postData.concat(link + "\n");
							});

							log.info('[RIVERS] Mutliple links', postData);

							sendToAlld(postData);
						} else {
							// Open generated link

							log.info('[RIVERS] Single', links);

							chrome.tabs.create({ url: links});
						}	

						delete env.config.rivers.links[riverID];
					}
					else {
						// Send link to Alld

						log.info('[RIVERS] Single buttonIndex != 0', links);

						chrome.storage.local.get(["user"], function (result) {
							chrome.tabs.create({ url: 'https://alldebrid.' + env.config.domain + '/service/?url=' + encodeURIComponent(links)});
							delete env.config.rivers.links[riverID];
						});
						
					}
				}
			}
			else if(notificationId == 'premiumRemainder') {
				// User clicked on renew 
				chrome.tabs.create({ url: 'https://alldebrid.' + env.config.domain + '/offer/'});
				chrome.notifications.clear('premiumRemainder');
			}
		});

		chrome.notifications.onClosed.addListener( (notificationId, byUser) => {
			if(byUser == true && notificationId.indexOf('river-') === 0) {
				// Tracked closed live notif to prevent re-diplaying it to the user
				notificationId = parseInt(notificationId.substring(6));

				env.config.rivers.liveNotif.splice(env.config.rivers.liveNotif.indexOf(notificationId), 1);
				env.config.rivers.closedNotif.push(notificationId);
			}
		});
	}
})();

async function bootstrap () {
	log.info('[USER] Loggued as', env.user);

	// Remainder
	if(env.user.isPremium && env.user.premiumUntil < (timestamp() + 60 * 60 * 24 * 3) ) {
		var lastRemainder = await storage.get('lastPremiumRemainder');

		if(lastRemainder == undefined || (new Date).getDate() != lastRemainder) {

			storage.set({'lastPremiumRemainder': (new Date).getDate()});

			var notifOpts = {
				type: "basic",
				iconUrl: env.config.imgs.logo,
				title: lang("notif_premium_remainder"),
				message: lang("notif_premium_remainder_desc"),
				isClickable: false,
				buttons: [{title: lang("notif_premium_remainder_btn")}],
				requireInteraction: true
			};

			browser.notifications.create(
				"premiumRemainder", 
				notifOpts
			).then((notifId) => { setTimeout(() => {browser.notifications.clear(notifId);}, 15000); }); // , function(notID) {}
		}
	}

	if(!env.user.isPremium)
		log.warn('[CORE] User not premium, only usable features activated');


	// Get host data from api
	var response = await api.fetch('user/hosts');

	if(response.error) {
		//notification(lang("error"), lang("notif_generic_error_desc"));
		return;
	}

	// Ok we have hosts data, let's setup everything
	setupRegexps(response);
	setupContentScripts();
	setupContextMenu();

	if(env.user.isPremium) { // Even the funky stuff
		setupInterception();
	}

	if(env.user.lang != env.langStore.lang) {
		log.info('[CORE] Refreshing lang');
		refreshLangStore();
	}

	env.config.rivers.lastUpdate = 0;
	env.config.boot = true;

	cron();

	log.info('[CORE] Bootstrapping OK');
}

function unbootstrap() {
	browser.contextMenus.removeAll();

	if(browser.webNavigation.onBeforeNavigate.hasListener(redirectionListener)) {
		browser.webNavigation.onBeforeNavigate.removeListener(redirectionListener);
	}

	if(browser.webRequest.onBeforeRedirect.hasListener(getHiddenId)) {
		browser.webRequest.onBeforeRedirect.removeListener(getHiddenId);
	}

	if(browser.webRequest.onBeforeRequest.hasListener(interceptStreamSource)) {
		browser.webRequest.onBeforeRequest.removeListener(interceptStreamSource);
		browser.webRequest.onHeadersReceived.removeListener(interceptApi);
	}

	env.config.hosts = {};
	env.config.boot = false;
	log.info('[CORE] Unootstrapping OK');
}

async function cron() {
	var currentTime = timestamp();
	var nextCheckIn = 5000; // cron every 5 secondes

	// Stop cron if unbootstrapped
	if(env.config.boot == false)
		return;

	if(currentTime > env.config.hosts.lastUpdate + 60 * 15) {
		await refreshRegexps();
		await refreshLangStore();
	}

	if(env.user.isPremium) {

		var riversCheckDelay = 120; // Every 2 min

		if(env.config.rivers.hasRunning) // User have river running, check more often
			riversCheckDelay = 30;

		if(env.options.riverLiveNotif == true && env.config.rivers.liveNotif.length > 0) {
			riversCheckDelay = 2; // Live notif in progress, every 2 seconds
			nextCheckIn = 1000; // Trigger cron more often
		}

		if(currentTime > env.config.rivers.lastUpdate + riversCheckDelay) {
			await checkRivers();
		}
	}


	// We used await, so async tasks are blocking, no risk to DOS us if something go to shit
	setTimeout(cron, nextCheckIn);
}

async function setupRegexps(response) {

	// Parse regexps from API
	var hosts = response.hosts;
	var streams = response.streams;
	var redirectors = response.redirectors;

	env.config.hosts.hostList = [];
	env.config.hosts.folderList = [];
	env.config.hosts.streamList = [];

	env.config.hosts.hostsRegexp = {};
	env.config.hosts.foldersRegexp = {};
	env.config.hosts.streamRegexp = {};

	env.config.hosts.hardRedirect = [];
	env.config.hosts.hardRedirectRegexps = {};
	env.config.hosts.hardRedirectPatterns = [];

	env.config.hosts.priority = {};

	for(var host in hosts) {
		env.config.hosts.hostList.push(host);
		env.config.hosts.hostsRegexp[host] = [];

		hosts[host]['regexps'].forEach( (regexp) => {
			env.config.hosts.hostsRegexp[host].push(regexp);
		});

		// Some hosts have hard redirection in place, we need patterns for them to setup the webrequest listener
		if(exists(hosts[host]['hardRedirect'])) {
			hosts[host]['domains'].forEach( (domain) => {
				env.config.hosts.hardRedirect.push(domain);
				env.config.hosts.hardRedirectRegexps[domain] = hosts[host]['hardRedirect'];
				env.config.hosts.hardRedirectPatterns.push('*://' + domain + '/*');
			});
		}
	}

	for(var stream in streams) {
		env.config.hosts.streamList.push(stream);
		env.config.hosts.streamRegexp[stream] = [];

		streams[stream]['regexps'].forEach( (regexp) => {
			env.config.hosts.streamRegexp[stream].push(regexp);
		});
	}

	for(var redirector in redirectors) {
		env.config.hosts.folderList.push(redirector);
		env.config.hosts.foldersRegexp[redirector] = [];

		redirectors[redirector]['regexps'].forEach( (regexp) => {
			env.config.hosts.foldersRegexp[redirector].push(regexp);
		});
	}

	env.config.hosts.lastUpdate = timestamp();

	var response = await api.fetch('hosts/priority');

	if(response.success == true) {
		env.config.hosts.priority = response.hosts;
	}

	log.info('[CORE] Regexp OK, got', env.config.hosts.hostList.length, 'hosts,', env.config.hosts.folderList.length , 'folders and', env.config.hosts.streamList.length, 'streams ');

	storage.set({config: env.config});
}

async function refreshRegexps()  {
	var response = await api.fetch('user/hosts');

	if(response.error) {
		//notification(lang("notif_generic_error"), lang("notif_generic_error_desc"));
		return;
	}

	setupRegexps(response);
	setupContextMenu(); // Need to reset context menus for them to register new patterns
	env.config.rivers.session = getRandomInt(1, 100000);
}

async function refreshLangStore() {
	
	var lang = env.user.lang;

	if(typeof lang == 'undefined')
		lang = 'en';

	var response = await api.fetch('lang', {prefix: 'webext', lang});

	if(response.webext !== 'true') {
		log.info('[CORE] Could not get lang data');
		env.langStore = {};
		return;
	}

	env.langStore = response;
	env.lang = lang;

	log.info('[CORE] Lang refreshed');

	return;
}

// Setup content scripts for black bar, popup on selection and messaging features
async function setupContentScripts()  {

	// Listen to navigation event onComplete to dynamically insert content scripts if user activated related features
	// Even if not loggued, need messaging in place for the website to communicate with the extension
	if(!browser.webNavigation.onCompleted.hasListener(csListener)) {
		log.info('[CORE] CS listeners OK');
		browser.webNavigation.onCompleted.addListener(csListener);
	}

	if(!env.config.isLoggued)
		return;

	var hasRedirectionListener = browser.webNavigation.onBeforeNavigate.hasListener(redirectionListener);
	if(env.options.changeLink == true) {
		if(!hasRedirectionListener) {
			// User want redirection and listener not setup, creating it
			log.info('[CORE] Redirection listeners OK');
			browser.webNavigation.onBeforeNavigate.addListener(redirectionListener);
		}
	} else {
		if(hasRedirectionListener) {
			// User doesn't want redirection and listener is setup, removing it
			browser.webNavigation.onBeforeNavigate.removeListener(redirectionListener);
		}
	}

	browser.tabs.onActivated.addListener(onTabChange);
	browser.tabs.onRemoved.addListener(onTabRemove);
	browser.tabs.onUpdated.addListener(onTabUpdate);
}

async function setupContextMenu() {

	//Reset right-click handlers with updated domain list
	browser.contextMenus.removeAll();

	// Hidden by default
	

	if(env.config.contextUnlock !== false) {
		// Show the menu
		browser.contextMenus.create({
			"title": lang("context_unlock"), 
			"contexts": ["link"], 
			"onclick": download, 
			"id": 'downloadLink'
		});
	}

	if(env.config.currentSelection !== false) {
		// Show the menu
		browser.contextMenus.create({
			"title": lang("context_unlock_multiple"), 
			"contexts": ["selection"],
			"onclick": downloadSelection, 
			"id": 'downloadLinks'
		});
	}

	if(env.user.isPremium) {
		// No river support if no subscription, no need for those options
		if(env.config.rivers.isLearning == true) {
			browser.contextMenus.create({
				"title": lang("context_learn"), 
				"contexts":["link"], 
				"onclick": learn, 
				"id": 'learnLink'
			});
		}

		var patterns = ['*://*/*.torrent', '*://*/*torrent*', "*://*/*.torrent?*", "*://*/*.torrent#*"];

		if(env.config.client.features.extendedPattern == true)
			patterns.push('magnet:*'); 

		// Add user custom sources
		if(env.options.riverCustomSource == true && env.options.customSources.length > 0)
			patterns = patterns.concat(env.options.customSources);

		//log.info('[CORE] River patterns', patterns);

		browser.contextMenus.create({
			"title": lang("context_river"), 
			"contexts":["link"], 
			"onclick": downloadRiver, 
			"id": 'uploadYNW',						                      
			'targetUrlPatterns': patterns
		});
	}

	log.info('[CORE] Context menus OK');
}

async function setupInterception(fullReload)  {

	// Force remove the listener to update urls matching list
	if(fullReload == true) {
		if(browser.webRequest.onBeforeRedirect.hasListener(getHiddenId)) {
			browser.webRequest.onBeforeRedirect.removeListener(getHiddenId);
		}
	}

	// get id from some redirection-heavy hosts
	if(env.config.hosts.hardRedirectPatterns.length > 0 && !browser.webRequest.onBeforeRedirect.hasListener(getHiddenId)) {
		log.info('[CORE] hiddenID listener OK');
		browser.webRequest.onBeforeRedirect.addListener(
		  	getHiddenId,
		  	{urls: env.config.hosts.hardRedirectPatterns}
		);
	}
	
	// handle in-place source replacement for some stream host
	var hasStreamSourceListener = browser.webRequest.onBeforeRequest.hasListener(interceptStreamSource);
	if(env.options.replaceStreamSource == true) {
		if(!hasStreamSourceListener) {
			log.info('[CORE] OL/SM listener OK');
			browser.webRequest.onBeforeRequest.addListener(
			  	interceptStreamSource,
			  	{urls: ["https://openload.co/stream/*", "https://streamango.com/v/d/*"]},
			  	["blocking"]
			);
			browser.webRequest.onHeadersReceived.addListener(
			  	interceptApi,
			  	{urls: ["https://api.alldebrid.com/link/*"]},
			  	["responseHeaders"]
			);
		}	
	} else {
		if(hasStreamSourceListener) {
			log.info('[CORE] OL/SM listener removed');
			browser.webRequest.onBeforeRequest.removeListener(interceptStreamSource);
			browser.webRequest.onHeadersReceived.removeListener(interceptApi);
		}
	}
}



function downloadRiver (info, tab, forward) {

	// TODO rewrite with fetch. One day...

	var riverErrors = {
		invalid_magnet: lang('river_error_invalid_magnet'),
		not_a_magnet: lang('river_error_not_a_magnet'),
		must_be_loggued: lang('river_error_must_be_loggued'),
		must_be_premium: lang('river_error_must_be_premium'),
		already_added: lang('river_error_already_added'),
		torrent_too_large: lang('river_error_river_too_large'),
		invalid_torrent: lang('river_error_invalid_river'),
		not_a_torrent: lang('river_error_not_a_river'),
		upload_failed: lang('river_error_upload_failed'),
		max_queue_reached: lang('river_error_max_queue_reached')
	};

	if( info.linkUrl.slice(0,6).toUpperCase() == 'MAGNET') {
		
		log.info('[FEAT] Magnet detected, sending to Alldebrid');

		var xhr2 = new XMLHttpRequest();
		xhr2.withCredentials = true;
		var fd = new FormData();

		fd.append("magnet" , info.linkUrl);
		fd.append("exte" , 'nsion');
		xhr2.open('POST', 'https://upload.alldebrid.com/uploadtorrent.php', true);

		xhr2.onload = function(e) {
			try {
				var response = JSON.parse(this.response);

				if(response.results[0].status == "OK") {
					var id = response.results[0].id;
					log.info('[FEAT] Magnet uploaded, id', id);

					env.config.rivers.running[parseInt(response.results[0].id)] = 0;

					checkRivers();
					notification(lang("notif_river_uploaded"), lang("notif_river_uploaded_desc"), 'river-' + id);

				} else {
					log.info('Server returned an error', response.results[0].error);

					notification(lang("error"), response.results[0].error);
				}
			} catch (err) {
				log.info('JSON error');
				notification(lang("notif_river_upload_error"), lang("notif_river_upload_error_desc"));
				return;	
			}	
		}
		xhr2.send(fd);
		return;
	} else {
		//console.info(info.menuItemId);
		var xhr = new XMLHttpRequest();
		xhr.open('GET', info.linkUrl, true);
		xhr.withCredentials = true;
		xhr.responseType = 'arraybuffer';
		xhr.onreadystatechange = function() {
			if(this.readyState == 2) {
				try {
					if (this.status == '404') {
						notification(lang("error"), lang("notif_river_404"));
						return;
					}
					var size = this.getResponseHeader("Content-Length");

					if(size >  15000000) {
						notification(lang("error"), lang("notif_river_too_big"));
						this.abort();
					}
				} catch(err) {
				}
			}
			if(this.readyState == 4 && this.status == '200') {
				var contentDispo = this.getResponseHeader("Content-Disposition");
				var type = this.getResponseHeader("Content-Type");

				if(contentDispo == null)
					contentDispo = '';

			    if( contentDispo.indexOf('torrent') > -1 || type.indexOf("application/x-bit" + 'torrent') > -1)  {

			    	log.info('[FEAT] River detected, sending to Alldebrid');

			     	var blob = new Blob([this.response], {type: 'application/x-bit' + 'torrent'});

			    	var xhr2 = new XMLHttpRequest();
			    	xhr2.withCredentials = true;
					var fd = new FormData();
					fd.append("files[]", blob, 'alld.torrent');
					fd.append("exte" , 'nsion');
					xhr2.open('POST', 'https://upload.alldebrid.com/uploadtorrent.php', true);
					xhr2.onload = function(e) {
						try {
							var response = JSON.parse(this.response);

							if(response.results[0].status == 'OK') {

								var id = response.results[0].id;
								log.info('[FEAT] River uploaded, id', id);

								notification(lang("notif_river_uploaded"), lang("notif_river_uploaded_desc"), 'river-' + id);

								env.config.rivers.running[parseInt(response.results[0].id)] = 0;

								checkRivers();
							} else {

								log.info('[RIVER] Server returned an error', response.results[0].error);

								notification(lang("notif_river_upload_error"), riverErrors[response.results[0].error]);
							}
						} catch (err) {
							log.info('[RIVER] JSON error', err);

							notification(lang("notif_river_upload_error"), lang("notif_river_upload_error_desc"));
							return;	
						}	
					}
					xhr2.send(fd);
			    } else {
			    	log.info('[RIVER] Error, not a valid river');

			    	notification(lang("error"), lang("notif_river_invalid"));
			    }
			}
		};
		xhr.send();	
	}	
}

async function checkRivers() {

	if(!env.config.isLoggued)
		return;

	if(!env.options.riverCompletionNotif) // User doesn't want any notif
		return;

	env.config.rivers.lastUpdate = timestamp();

	var rivers = await api.rivers();

	if(env.config.rivers.list == false) { // First sync, init stuff
		firstHit = true;
		env.config.rivers.list = rivers;
	}
	rivers.forEach(function(torrent) {
		if(!('id' in torrent)) {
			return;
		}

		if(torrent.id in env.config.rivers.list) {
			// We already have data for this torrent
			var keys = Object.keys(torrent);

			if('deleted' in torrent) {
				// Torrent was deleted
				delete env.config.rivers.list[torrent.id];
			} else {
				// Sync diff values
				keys.forEach(function(key) {
					env.config.rivers.list[torrent.id][key] = torrent[key];
				});
			}	
		} else {
			// New torrent, let's add it
			env.config.rivers.list[torrent.id] = torrent;
		}
	});
	
	var riversIDs = [];
	var runningRiversIDs = [];

	//log.info('[RIVERS] Checking rivers updates');

	//rivers.forEach( (river) => {
	objForEach(env.config.rivers.list, (river) => {
		//log.info('[RIVERS] Processing ', river)

		if(river.statusCode < 4) { // Running river
			runningRiversIDs.push(river.id);

			if(!exists(env.config.rivers.running[river.id])) { // First time we see it. 
				log.info('[RIVER] Adding river to running array');
				env.config.rivers.running[river.id] = river.statusCode; // Saving state, we display notif on state change. Skipping
				//return log.info('Saving state, we display notif on state change. Skipping');
			}

			if(!env.options.riverLiveNotif) // If no live notif, user doesn't care for running state.
				return log.info('[RIVER] If no live notif, user doesnt care for running state.');
		} else if(!exists(env.config.rivers.running[river.id])) {
			return ; //log.info('[RIVER] Old river already processed, skipping');
		}

		if(exists(env.config.rivers.running[river.id]) && env.config.rivers.running[river.id] == river.statusCode && !env.options.riverLiveNotif)  // Same status as before. Skipping
			return log.info('[RIVER] Same status as before. Skipping');

		var links = false;
		var progress = 0;

		switch (river.statusCode) {
		  case 0: // Queued
		    var title = lang("notif_river_live_queue"); 
			var message = river.filename + lang("notif_river_live_queue_desc"); 
		    break;
		  case 1: // DLing
		    var title = lang("notif_river_live_downloading") + ' ( ' + humanFileSize(river.downloadSpeed) + '/s )';
			var message = river.seeders + ' ' + lang("notif_river_live_seeders") + river.filename;
			
			progress = 0;
			if(river.size != 0)
				progress = Math.floor(river.downloaded / river.size * 100);
			
		    break;
		  case 2: // Processing
		    var title = lang("notif_river_live_moving");
			var message = lang("notif_river_live_moving_desc") + ' ' + river.filename;
		    break;
		  case 3: // Uploading
		    var title = lang("notif_river_live_uploading") + '( ' + humanFileSize(river.uploadSpeed) + '/s )';
			var message = river.filename + ' ' + lang("notif_river_live_uploading_desc");
			progress = Math.floor(river.uploaded / river.size * 100);
		    break;
		  case 4: // Ready
			var title = lang("notif_river_live_ready");
			var message = river.filename + ' ' + lang("notif_river_live_ready_desc");
			progress = 100;
			
			if(river.link.length == 1)	
				links = river.link[0];
			else
				links = river.link;

			env.config.rivers.links[river.id] = links;

			log.info('[RIVERS] New links array', env.config.rivers);
		    break;
		  case 5: // Error states
		  case 6:
		  case 7:
		  case 8:
		  case 9:
		  case 10:
		  	var title = lang("error");
			var message = river.filename + ' : ' + river.status;
		    break;
		  default:
		  	log.info('Weird river', river);
		  	return;
		    break;
		}

		if(river.statusCode < 4) {// User still here so has live notif enabled
			if(env.config.client.features.liveNotif != true)
				return;

			liveNotification(river.id, progress, title, message, links);
			return;
		}

		log.info('[RIVER] Done', river.filename);

		delete env.config.rivers.running[river.id]; // Either Ready or error, not running anymore

		if(river.statusCode == 4) { 
			if(env.config.client.features.liveNotif == true) {
				// display notif with button if supported

				return liveNotification(river.id, progress, title, message, links);	
			} 
			
			return notification(title, message, 'river-' + river.id);
		}

		if(river.statusCode > 4)
			return notification(title, message, 'river-' + river.id);

	});

	env.config.rivers.hasRunning = false;


	// Cross check river list and our state array tracking running and closed river
	objForEach(env.config.rivers.running, (riverStatus, index) => {
		index = parseInt(index);
		if(runningRiversIDs.indexOf(index) === -1) {
			// Dead running river
			log.info('[RIVER] Purging stale river', index);
			
			delete env.config.rivers.running[index];
		} else {
			env.config.rivers.hasRunning = true;
		}
	});

	env.config.rivers.closedNotif.forEach( (riverID, index) => {
		if(runningRiversIDs.indexOf(riverID) === -1) {
			// Dead running river
			log.info('[RIVER] Purging stale river closed notif', riverID);

			env.config.rivers.closedNotif.splice(index, 1);
		}
	});	
}

// Setup extension messaging to communication with native messaging, popup, content scripts and websites
browser.runtime.onMessage.addListener(handleMessage);



