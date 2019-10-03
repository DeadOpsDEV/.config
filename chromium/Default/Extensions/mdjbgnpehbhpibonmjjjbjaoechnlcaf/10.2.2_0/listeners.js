var csListener = async (details) => {
	// Listener that insert content scripts by listening to webnavigation onCompleted

	var url = details.url;
	var domain = uri.extractRootDomain(url);
	var tabId = details.tabId;

	if(url.indexOf("chrome://") !== -1 || url.indexOf("about:") !== -1)
		return;

	if(env.config.alldDomains.indexOf(domain) !== -1) {
		// Insert communication script in whitelisted domains
		log.info('[COM] Inserting communication CS on ' + details.url);

		browser.tabs.executeScript(details.tabId, {
			file: "/content-scripts/messaging.js",
			runAt: "document_end"
		}).catch( (result) =>  {
			log.info('[COM] Error inserting messaging CS', result)
		});
	}

	if(!env.config.isLoggued)
		return;

	// Link detector CS
	log.info('[FEAT] Inserting link detector CS', url);
	browser.tabs.executeScript(details.tabId, {
		file: "/content-scripts/link-detector.js",
		runAt: "document_end",
		allFrames: true
	}).catch( (result) =>  {
		//log.info('Error inserting content script : ', result)
	});

	// Other than link detector, only insert script on top frame
	if(details.frameId !== 0)
		return;

	for(var i in env.config.hosts.hardRedirect) {
		if(url.indexOf('://' + env.config.hosts.hardRedirect[i] + '/download') !== -1) {
			url = url.substr(0, url.length - 8) + env.config.hiddenID;
			log.info('[CORE] Virtual url for', env.config.hosts.hardRedirect[i], 'switched to', url);
		}
	}

	if(env.config.alldDomains.indexOf(domain) !== -1) {
		// Insert communication script in whitelisted domains
		log.info('[COM] Inserting communication CS on ' + details.url);

		browser.tabs.executeScript(details.tabId, {
			file: "/content-scripts/messaging.js",
			runAt: "document_end"
		}).catch( (result) =>  {
			log.info('[COM] Error inserting messaging CS', result)
		});
	}

	if(isValidHostLink(url)) {
		// Only check and insert content script on supported urls
		if(env.options.blackBar == true) {
			// Inserting top balck bar content script
			log.info('[FEAT] Inserting black bar CS on', url);
			browser.tabs.executeScript(tabId, {
				file: "/content-scripts/blackbar.js",
				allFrames: false
			}).catch( (result) =>  {
				log.info('[FEAT] Error inserting blackbar CS', result)
			});
		}
	}
}

var redirectionListener = async (details) => {
	// Listener that insert content scripts by listening to webnavigation onCompleted

	var url = details.url;
	var domain = uri.extractRootDomain(url);
	var tabId = details.tabId;

	if(url.indexOf("chrome://") !== -1 || url.indexOf("about:") !== -1 || env.config.alldDomains.indexOf(domain) !== -1 || env.options.changeLink !== true)
		return;

	// Other than link detector, only insert script on top frame
	if(details.frameId !== 0)
		return;

	for(var i in env.config.hosts.hardRedirect) {
		if(url.indexOf('://' + env.config.hosts.hardRedirect[i] + '/download') !== -1) {
			url = url.substr(0, url.length - 8) + env.config.hiddenID;
			log.info('[CORE] Virtual url for', env.config.hosts.hardRedirect[i], 'switched to', url);
		}
	}

	if(isValidHostLink(url)) {
		log.info('[FEAT] Redirecting to Alldebrid with url', url);
		
		// Redirection user to Alldebrid									
		browser.tabs.update(
			tabId, 
			{url: 'https://alldebrid.' + env.config.domain + '/service/?url=' + encodeURIComponent(url)}
		);
	}
}

var learn = (info) => {
	// Already learned ?
	if(env.config.rivers.learnLinks.indexOf(info.linkUrl) != -1)
		return;

	env.config.rivers.learnLinks.push(info.linkUrl);

	log.info('[FEAT] Learning link', info.linkUrl, env.config.rivers.learnLinks);	
}

var getHiddenId = (requestDetails) => {

	var isMatch = false,
	    match = false;

	for(var i in env.config.hosts.hardRedirect) {
		var host = env.config.hosts.hardRedirect[i];
		var regexp = new RegExp(env.config.hosts.hardRedirectRegexps[host]);

		if( (match = requestDetails.url.match(regexp) ) !== null) {
			log.info('[CORE] Saved hiddenID', match[1], 'for', host);
			env.config.hiddenID = match[1];
		}
	}	
}

var interceptStreamSource = (requestDetails) => {
	// intercept media streaming request, and forward to Alldebrid

	let streamUrl = requestDetails.url;

	if(!env.config.isLoggued)
		return;

	if(streamUrl == env.config.lastSource)
		return;

	// Check stream link is OK
	var match, host = false;
	if( (match = requestDetails.url.match(/https:\/\/streamango\.com\/v\/d\/([a-zA-Z0-9_\-]{16})/) ) !== null) {
		var link = 'https://streamango.com/embed/' + match[1];
		host = 'streamango';
	}
	else if( (match = requestDetails.url.match(/https:\/\/openload\.co\/stream\/([a-zA-Z0-9_\-]{11})/) ) !== null) {
		var link = 'https://openload.co/embed/' + match[1];
		host = 'openload';
	} 

	if(!host)
		return;

	// If user manually disabled this video, skip
	if(env.config.disabledSourceID == match[1])
		return;

	env.config.lastSource = streamUrl;

	log.info('[FEAT] OL/SM match, redirecting source', link);

	let redirectUrl = api.getUrl('link/unlock', {link, redirect: 'on', fallbackUrl: streamUrl});

	return {redirectUrl: redirectUrl};
}

var interceptApi = (requestDetails) => {
	// listen to api response for intercepted stream source
	// if proxy via Alldebrid OK, warn the user the video is being proxied
	// If not, do nothing, and request will automatically derirect to initial request source

	if(requestDetails.statusCode != 302)
		return;

	var player = false;
	var streamUrl = uri.extractParam(requestDetails.url, 'link');

	// Get player infos from host
	if(streamUrl.indexOf('https://openload.co') === 0) {
		player = {
			logo: 'vjs-ol-button',
			handle: 'olvideo_html5_api'
		}
	} else if(streamUrl.indexOf('https://streamango.com') === 0) {
		player = {
			logo: 'vjs-mg-button',
			handle: 'mgvideo_html5_api'
		}
	}

	if(player === false)
		return;

	requestDetails.responseHeaders.forEach((header) => {
		// Insert communication and UI to inform the user of what's happenning
		if(header.name == 'location' && header.value && header.value.indexOf('.alld.io/dl') !== -1) {
			browser.tabs.executeScript(requestDetails.tabId, {
				file: "/content-scripts/messaging.js",
				runAt: "document_end"
			}).catch( (result) =>  {
				log.info('[FEAT] Error inserting messaging CS', result);
			});
			browser.tabs.executeScript(requestDetails.tabId, 
				{code: "\
					if(typeof AlldSourceReplaceInjected == 'undefined') {\
						if(document.getElementById('videooverlay'))\
							document.getElementById('videooverlay').style.display = 'none';\
						var AlldSourceReplaceInjected = true;\
						var Allddiv = document.createElement('div');\
						var AlldSpanStream = document.createElement('span');\
						var AlldSpanDL = document.createElement('span');\
						var AlldSpanDisable = document.createElement('span');\
						var Allda = document.createElement('a');\
						var Allda2 = document.createElement('a');\
						\
						Allda.href = '" + header.value.replace('alld.io/dl/', 'alld.io/fdl/') + "';\
						Allda2.style.cssText = 'cursor: pointer;';\
						\
						Allddiv.style.cssText = 'width: 320px; height: 25px;background: rgba(250, 195, 51, 0.75);padding: 4px 0px 2px 6px;font-size: 11px;border-radius: 5px 5px 0px 0px;';\
						AlldSpanStream.innerText = '" + lang('source_replace_via') + " | ';\
						AlldSpanDL.innerText = '" + lang('source_replace_download') + "';\
						Allda2.id = 'alldDirectStream';\
						AlldSpanDisable.innerText = '" + lang('source_replace_disable') + "';\
						Allda.append(AlldSpanDL);\
						Allda2.append(AlldSpanDisable);\
						Allddiv.append(AlldSpanStream);\
						Allddiv.append(Allda);\
						Allddiv.append(' | ');\
						Allddiv.append(Allda2);\
						\
						var videoCont = document.getElementsByClassName('videocontainer');\
						if(videoCont.length > 0 && window.location.href.indexOf('embed') == -1) { \
							videoCont[0].prepend(Allddiv); \
							document.getElementById('alldDirectStream').addEventListener('click', function() { \
								alldSendMessage(\
									{command: 'disableSourceStream', url: location.href},\
									function() { location.reload(); }\
								);\
							});\
						}\
						if(document.getElementsByClassName('" + player.logo + "').length > 0)\
							document.getElementsByClassName('" + player.logo + "')[0].style.background = 'url(" + env.config.imgs.logo + ") center/contain no-repeat';\
					}"
				}
			).catch( (result) =>  {
				log.info('[FEAT] Error in OL/SM CS', result)
			});
		}
	});
}

var download = (info) => {
	log.info('[FEAT] Sending links to Alldebrid', info.linkUrl);

	info.linkUrl = decodeURI(info.linkUrl)

	sendToAlld(info.linkUrl)
}

var downloadSelection = (selection, checkOnly) => {
	// If checkOnly, parse selection, return boolean
	
	// If not, it comes from context menu action
	// We use saved selection from check, no need to requery it
	// And we trigger the download

	var validLinks = [];

    var hosts = env.config.hosts.hostsRegexp;
    var folders = env.config.hosts.foldersRegexp;

    var match;

    // Get saved selection
    if(checkOnly !== true)
    	selection = env.config.currentSelection;

    for(var host in hosts) {	
		if(env.options.disabledHosts == true && env.options.disabledHostsList.indexOf(host) != -1)
			continue;

		for(var reg in hosts[host]) {
			try {
				var regexp = hosts[host][reg];
				XRegExp.forEach(selection, XRegExp(regexp), (match, i) => {
					if(validLinks.indexOf(match[0]) == -1)
						validLinks.push(match[0]);
				});
			} catch (err) {
				log.warn('[CORE] Regexp error on', host, err, regexp);
				continue;	
			}
		}
	}

	for(var host in folders) {	
		if(env.options.disabledHosts == true && env.options.disabledHostsList.indexOf(host) != -1)
			continue;

		for(var reg in hosts[host]) {
			try {
				var regexp = hosts[host][reg];
				XRegExp.forEach(selection, XRegExp(regexp), (match, i) => {
					if(validLinks.indexOf(match[0]) == -1)
						validLinks.push(match[0]);
				});
			} catch (err) {
				log.warn('[CORE] Regexp error on', host, err, regexp);
				continue;	
			}
		}
	}

	if(env.options.enabledStream && env.options.enabledStreamList.length > 0) {

		var streams = env.options.enabledStreamList;

		for(var stream in streams) {
			for(var reg in env.config.hosts.streamRegexp[streams[stream]]) {
				try {
					var regexp = env.config.hosts.streamRegexp[streams[stream]][reg];
					XRegExp.forEach(selection, XRegExp(regexp), (match, i) => {
						if(validLinks.indexOf(match[0]) == -1)
							validLinks.push(match[0]);
					});
				} catch (err) {
					log.warn('[CORE] Regexp error on', host, err, regexp);
					continue;	
				}
			}
		}
	}
	if(checkOnly === true) {
		if(validLinks.length == 0) {
			return false;
		}

		return true;
	}

	if(validLinks.length > 0) {
		log.info('[FEAT] Sending selected links to Alldebrid', validLinks);
		sendToAlld(validLinks.join("\n"));
	} else {
		//log.info('SYS: no link found')      // //document.getElementById('form').submit();
	}
}

var findLinks = async (pageContent, tab) => {
	var validLinks = [];

    var hosts = env.config.hosts.hostsRegexp;
    var folders = env.config.hosts.foldersRegexp;

    var match;

    var rawValidLinks = [];

    for(var host in hosts) {	
		if(env.options.disabledHosts == true && env.options.disabledHostsList.indexOf(host) != -1)
			continue;

		for(var reg in hosts[host]) {
			try {
				var regexp = hosts[host][reg];
				XRegExp.forEach(pageContent, XRegExp(regexp), (match, i) => {
					if(validLinks.indexOf(match[0]) == -1 && rawValidLinks.indexOf(match[0]) === -1) {
						rawValidLinks.push(match[0]);
						validLinks.push({type: 'host', url: match[0]});
					}
				});
			} catch (err) {
				log.warn('[CORE] Regexp error on', host, err, regexp);
				continue;	
			}
		}
	}

	for(var host in folders) {	
		if(env.options.disabledHosts == true && env.options.disabledHostsList.indexOf(host) != -1)
			continue;

		for(var reg in folders[host]) {
			try {
				var regexp = folders[host][reg];
				XRegExp.forEach(pageContent, XRegExp(regexp), (match, i) => {
					if(validLinks.indexOf(match[0]) == -1 && rawValidLinks.indexOf(match[0]) === -1) {
						rawValidLinks.push(match[0]);
						validLinks.push({type: 'folder', url: match[0]});
					}
				});
			} catch (err) {
				log.warn('[CORE] Regexp error on', host, err, regexp);
				continue;	
			}
		}
	}

	if(env.options.enabledStream && env.options.enabledStreamList.length > 0) {

		var streams = env.options.enabledStreamList;

		for(var stream in streams) {
			for(var reg in env.config.hosts.streamRegexp[streams[stream]]) {
				try {
					var regexp = env.config.hosts.streamRegexp[streams[stream]][reg];
					XRegExp.forEach(pageContent, XRegExp(regexp), (match, i) => {
						if(validLinks.indexOf(match[0]) == -1 && rawValidLinks.indexOf(match[0]) === -1) {
							rawValidLinks.push(match[0]);
							validLinks.push({type: 'stream', url: match[0]});
						}
					});
				} catch (err) {
					log.warn('[CORE] Regexp error on', host, err, regexp);
					continue;	
				}
			}
		}
	}


	env.config.tabLinks[tab.id] = validLinks;

	if(tab.active == true) {
		if(validLinks.length == 0) {
			chrome.browserAction.setBadgeText({text: ''});
		}
		else {

			log.info('[FEAT] Links found on tab', tab.id, validLinks);

			var filesNb = await fetchPageLinksInfos(tab.id);

			if(filesNb > 0)
				chrome.browserAction.setBadgeText({text: filesNb.toString()});
			else
				chrome.browserAction.setBadgeText({text: ''});

		}
	}

	if(validLinks.length == 0) {
		return false;
	}



	return true;

}


var fetchPageLinksInfos = async (tabId) => {

	chrome.browserAction.setBadgeText({text: '?'});

	env.config.tabFilesProcessing[tabId] = true;

	var links = env.config.tabLinks[tabId];

	//console.log('Creating tabFiles for', tabId);

	env.config.tabFiles[tabId] = {};
	
	var linksBuffer = [];

	for(var i = 0, len = links.length; i < len; i++) {
		if(linksBuffer.length >= 10) {
			var response = await api.fetch('link/infos', {link: linksBuffer});

			linksBuffer = [];
			
			if(response.success == true) {
				objForEach(response.infos, (info, link) => {
					if(exists(info.error)) {
						return;
					}

					var isMultipart = /(.+)\.part[0-9]+\.rar$/.exec(info.filename);

					if(isMultipart !== null) {

						var cleanName = isMultipart[1];

						if(exists(env.config.tabFiles[tabId][cleanName])) {

							if(exists(env.config.tabFiles[tabId][cleanName].parts[info.filename])) {
								env.config.tabFiles[tabId][cleanName].parts[info.filename].links.push({host: info.hostDomain, link: info.link});
							} else {
								env.config.tabFiles[tabId][cleanName].nbParts++;
								env.config.tabFiles[tabId][cleanName].size = env.config.tabFiles[tabId][cleanName].size + info.size;

								env.config.tabFiles[tabId][cleanName].parts[info.filename] = {
									links : [{host: info.hostDomain, link: info.link}]
								};
							}
						} else {
							env.config.tabFiles[tabId][cleanName] = {
								size: info.size,
								nbParts: 1,
								parts: {
								}
							};

							env.config.tabFiles[tabId][cleanName].parts[info.filename] = {
								links: [{host: info.hostDomain, link: info.link}]
							};
						}
					} else {
						if(exists(env.config.tabFiles[tabId][info.filename])) {
							env.config.tabFiles[tabId][info.filename].links.push({host: info.hostDomain, link: info.link});
						} else {
							env.config.tabFiles[tabId][info.filename] = {
								size: info.size,
								links: [{host: info.hostDomain, link: info.link}]
							}
						}
					}	
				});
				browser.browserAction.setBadgeText({text: objLen(env.config.tabFiles[tabId]).toString()});
				if(browser.extension.getViews({ type: "popup" }).length > 0)
					browser.runtime.sendMessage({command: 'syncPageLinks', files: env.config.tabFiles[tabId], processing: env.config.tabFilesProcessing[tabId] });
			}
		}

		var linkInfos = links[i];

		if(linkInfos.type == 'folder') {
			var response = await api.fetch('link/redirector', {link: linkInfos.url});
			
			if(response.success == true) {
				response.links.forEach((link) => {
					linksBuffer.push(link);
				});
			}
		} else {
			linksBuffer.push(linkInfos.url);
		}
	}

	if(linksBuffer.length > 0) {
		var response = await api.fetch('link/infos', {link: linksBuffer});
		if(response.success == true) {
			if(linksBuffer.length == 1) {
				var infos = {};
				infos[response.infos.link] = response.infos;
				response.infos = infos;
			}
			objForEach(response.infos, (info, link) => {
					if(exists(info.error)) {
						return;
					}

					var isMultipart = /(.+)\.part[0-9]+\.rar$/.exec(info.filename);

					if(isMultipart !== null) {

						var cleanName = isMultipart[1];

						if(exists(env.config.tabFiles[tabId][cleanName])) {

							if(exists(env.config.tabFiles[tabId][cleanName].parts[info.filename])) {
								env.config.tabFiles[tabId][cleanName].parts[info.filename].links.push({host: info.hostDomain, link: info.link});
							} else {
								env.config.tabFiles[tabId][cleanName].nbParts++;
								env.config.tabFiles[tabId][cleanName].size = env.config.tabFiles[tabId][cleanName].size + info.size;

								env.config.tabFiles[tabId][cleanName].parts[info.filename] = {
									links : [{host: info.hostDomain, link: info.link}]
								};
							}
						} else {
							env.config.tabFiles[tabId][cleanName] = {
								size: info.size,
								nbParts: 1,
								parts: {
								}
							};

							env.config.tabFiles[tabId][cleanName].parts[info.filename] = {
								links: [{host: info.hostDomain, link: info.link}]
							};
						}
					} else {
						if(exists(env.config.tabFiles[tabId][info.filename])) {
							env.config.tabFiles[tabId][info.filename].links.push({host: info.hostDomain, link: info.link});
						} else {
							env.config.tabFiles[tabId][info.filename] = {
								size: info.size,
								links: [{host: info.hostDomain, link: info.link}]
							}
						}
					}	
				});

			env.config.tabFilesProcessing[tabId] = false;
		}
	}

	env.config.tabFilesProcessing[tabId] = false;

	if(browser.extension.getViews({ type: "popup" }).length > 0)
		browser.runtime.sendMessage({command: 'syncPageLinks', files: env.config.tabFiles[tabId], processing: env.config.tabFilesProcessing[tabId]});

	if(objLen(env.config.tabFiles[tabId]) > 0) {
		log.info('[FEAT] Files found on tab', tabId, env.config.tabFiles[tabId]);
	}

	return (objLen(env.config.tabFiles[tabId]) > 0);	
}



// Setup extension commincation, for content scripts, popup and native messaging
var handleMessage = async (request, sender) => {
		
	var command = request.command

	if(command != "checkLink")
		log.info('[COMM] New command', request);

	if(command == "sendPageLink") {

		var linksToSend = [];
		var linksToProcess = [];

		if(!exists(request.infos.nbParts)) {
			linksToProcess.push(request.infos.links);
		} else {
			objForEach(request.infos.parts, (infos, filename) => {
				linksToProcess.push(infos.links);
			});
		}

		linksToProcess.forEach((links) => {
			var bestLink = {priority: 1000};

			if(links.length > 1) {
				links.forEach( (link) => {
					if(exists(env.config.hosts.priority[link.host])) {
						if(env.config.hosts.priority[link.host] < bestLink.priority) {
							bestLink = {priority: env.config.hosts.priority[link.host], link: link.link}
						}
					}
					else {
						if(bestLink.priority == 1000) {
							bestLink = {priority: 999, link: link.link}
						}
					}
				});
			} else {
				bestLink.link = links[0].link
			}

			linksToSend.push(bestLink.link);
		});

		sendToAlld(linksToSend.join("\n"));
		return;

    }

    if(command == "sendPageAllLinks") {
		sendToAlld(request.links.join("\n"));
		return;

    }

	// Test link href, enable context menu is supported
	if(command == "manualFindLinks") {

		if(env.config.currentTab == false) {
			var tabInfos = await browser.tabs.query({active: true, currentWindow: true});

			if(tabInfos.length != 1)
				return {error: 'reload'};

			env.config.currentTab = tabInfos[0].id;
		}

		log.info('[COMM] User-triggued finding links from page content');
		log.info('[COMM] Sending command to tab', env.config.currentTab);

		return new Promise( async (resolve, reject) => {
			try {
				var pageContent = await 

				browser.tabs.sendMessage(env.config.currentTab, {command: 'manualScan'})
				.then(async (result) => {
					var hasValidLinks = await findLinks(result.payload, {id: env.config.currentTab, active: true});

					if(hasValidLinks === true) {
						browser.browserAction.setBadgeText({text: objLen(env.config.tabFiles[env.config.currentTab]).toString()});
						resolve(env.config.tabFiles[env.config.currentTab]);
					} else {
						browser.browserAction.setBadgeText({text: ''});
						resolve({});
					}
				});
			}
			catch(error) {
				var error = {error: 'reload'};
				resolve(error);
			}
	    });	
    }


    if(command == "findLinks") {

		log.info('[COMM] Finding links from page content');

		return new Promise( async (resolve, reject) => {
			var hasValidLinks = await findLinks(request.payload, sender.tab);

			if(hasValidLinks === true) {
				browser.browserAction.setBadgeText({text: objLen(env.config.tabFiles[env.config.currentTab]).toString()});
			} else {
				browser.browserAction.setBadgeText({text: ''});
			}

			resolve(hasValidLinks);
		});	
    }

    // Test link href, enable context menu is supported
	if(command == "checkLink") {

		var isValid = isValidHostLink(request.payload);

		if(isValid == true) {
    		if(env.config.contextUnlock == false) {
    			log.info('[COMM] Enabling single link unlock context menu');
    			browser.contextMenus.create({
					"title": lang("context_unlock"), 
					"contexts": ["link"], 
					"onclick": download, 
					"id": 'downloadLink'
				});
    		}

    		env.config.contextUnlock = true;
    		return true;
    	}
    	else {
    		if(env.config.contextUnlock == true) {
    			log.info('[COMM] Disabling single link unlock context menu');
    			browser.contextMenus.remove('downloadLink').then(
					() => {},
					() => {},
				);
    		}

    		env.config.contextUnlock = false;
    		return false;
    	}
    }

    // check user selection for supported links
    if(command == "checkSelection") {

    	var isValidSelection = downloadSelection(request.payload, true);

    	log.info('[COMM] Checking selection', isValidSelection, request.payload);
    	
    	if(isValidSelection == true) {
    		if(env.config.currentSelection === false) {
    			log.info('[COMM] Enabling selection unlock context menu');
    			browser.contextMenus.create({
					"title": lang("context_unlock_multiple"), 
					"contexts": ["selection"],
					"onclick": downloadSelection, 
					"id": 'downloadLinks'
				});
    		}

    		env.config.currentSelection = request.payload;
    		return true;
    	}
    	else {
    		if(env.config.currentSelection !== false) {
    			log.info('[COMM] Disabling selection unlock context menu');
    			browser.contextMenus.remove('downloadLinks').then(
					() => {},
					() => {},
				);
    		}

    		env.config.currentSelection = false;
    		return false;
    	}	
    }

    // Disable selection context menu
    if(command == "emptySelection") {
    	log.info('[COMM] Emptying selection');

    	if(env.config.currentSelection !== false) {
    		log.info('[COMM] Disabling selection unlock context menu');
			browser.contextMenus.remove('downloadLinks').then(
				() => {},
				() => {},
			);
		}
		env.config.currentSelection = false;
		return true;
    } 


	if(command == 'env') {
		// Return env variables for content scripts and popup
		if(typeof(request.key) == 'string') {
			// Only a single key requested, let's return it
			//log.info('[COMM] Sending env variable', request.key, 'to', request.from);
			return getEnv(request.key);
		} 

		if(Array.isArray(request.keys)) {
			var payload = {};

			for(var i = 0, len = request.keys.length; i < len; i++) {
				var value = getEnv(request.keys[i]);
				if(value !== false) {
					// Get request element name. 'config' => 'config', 'config.hosts.last_update' => 'last_update'
					var key = request.keys[i].split('.').pop(); 

					payload[key] = value;
				}
			}
			//log.info('[COMM] Sending env variables', request.keys, 'to', request.from);
			return payload;
		}

		return {error: 'No valid key string or keys array given', command}; // Bad arguments
	}

	if(command == 'settings') {
		// Change settings, from popup
		objForEach(request.updates, (value, key) => {
			if(key == 'disabledHostsList' || key == 'enabledStreamList' || key == 'customSources') {
				if(value.add) {
					log.info('[COMM] Updated setting, adding', value.add, 'to', key, 'from', request.from);
					env.options[key].push(value.add);
				}
				if(value.delete) {
					log.info('[COMM] Updated setting, deleting', value.delete, 'to', key, 'from', request.from);
					env.options[key].splice(env.options[key].indexOf(value.delete), 1);
				}
				if(key == 'customSources') {
					setupContextMenu();
				} else {
					refreshRegexps();
				}
			} else {
				log.info('[COMM] Updated setting', key, 'to', value, 'from', request.from);
				env.options[key] = value;

				if(key == 'enabledStream' || key == 'disabledHosts')
					refreshRegexps();
				if(key == 'riverCustomSource')
					setupContextMenu();
				if(key == 'replaceStreamSource')
					setupInterception();
				if(key == 'changeLink')
					setupContentScripts();
				if(key == 'findPageLinks') {
					if(value == false) {
						chrome.browserAction.setBadgeText({text: ''});
						env.config.tabLinks = {};
						env.config.tabFiles = {};
						env.config.tabFilesProcessing = {};
					}
				}
			}	
		});
		storage.set({options: env.options});
		return;
	}

	if(command == 'disableSourceStream') {
		let match;
		if( (match = request.url.match(/https:\/\/streamango\.com\/(f|embed)\/([a-zA-Z0-9_\-]{16})/) ) !== null) {
			log.info('[COMM] Disabling source replacement for', match[2]);
			env.config.disabledSourceID = match[2];
		}
		else if( (match = request.url.match(/https:\/\/openload\.co\/(f|embed)\/([a-zA-Z0-9_\-]{11})/) ) !== null) {
			log.info('[COMM] Disabling source replacement for', match[2]);
			env.config.disabledSourceID = match[2];
		} 

		return;
	}

	if(command == 'toggleLearning') {
		if(request.value == true) { // Enable learning context menu option
			log.info('[FEAT] Enabling custom source learning');
			browser.contextMenus.create({
				"title": 'Learn torrent link', 
				"contexts":["link"], 
				"onclick": learn, 
				"id": 'learnLink'
			});
			env.config.rivers.isLearning = true;
			env.config.rivers.learnLinks = [];
		} else {
			log.info('[FEAT] Disabling custom source learning');
			browser.contextMenus.remove('learnLink').then(
				() => {},
				() => {},
			);
			env.config.rivers.isLearning = false;
			env.config.rivers.learnLinks = [];
		}

		return;
	}

	if(command == 'addCustomSource') {
		var pattern = request.pattern;

		if(env.options.customSources.indexOf(pattern) !== -1)
			return false; // Pattern already exists

		log.info('[FEAT] Add custom source pattern', pattern);

		env.options.customSources.push(pattern);
		env.config.rivers.learnLinks = [];
		env.config.rivers.isLearning = false;
		setupContextMenu();

		storage.set({options: env.options});

		return true;
	}
	
	// From popup content script
	if(command == "processSelection") {
    	log.info('[COMM] Processing selection', request.payload)

    	downloadSelection(request.payload);
    	return;
    } 

    // Initiate local stream to native player
    if(command == "localStream") {
    	if(env.options.localPlayerPath.length == 0)
    		return {error: 'No local player set'};

    	if(env.config.client.os == 'mac')
    		native.localStream(env.options.localPlayer, request.url);
    	else
    		native.localStream(env.options.localPlayerPath, request.url);
    	
    	return true;
    }

    // test weither user provider pattern is valid or not
    if(command == "testPattern") {
    	var pattern = request.pattern;

    	// return Promise, shit I look like I know what I'm doing
    	// Does that even works ?
    	return new Promise(resolve => {
	      	var coucou = browser.contextMenus.create({
				"title": 'Testing user pattern', 
				"contexts": ["link"], 
				"onclick": () => {}, 
				"id": 'userPatternCheck',
				"targetUrlPatterns": [pattern]
			}, () => {
				if (browser.runtime.lastError) {
					log.warn(browser.runtime.lastError);
					return resolve(false);
				}
				browser.contextMenus.remove('userPatternCheck');
				return resolve(true);
			});
	     });
    } 

    if(command == "isLoggued") {
    	if(env.langStore.webext != 'true')
    		await refreshLangStore();
    	
    	env.config.client = await getClientInfos();
    	return await api.login();
    }

    if(command == "syncLogguedState") {
    	if( (env.config.isLoggued && request.isLoggued == false) || 
    		(!env.config.isLoggued && request.isLoggued == true) ) {

    		log.info('[COMM] Syncing loggued state');

    		env.config.client = await getClientInfos();
    		api.login();
    	}   	
    }

    if(command == "debugHistory") {
    	return log.history;
    } 

    // Bootsrap app features, if loggued from popup
    if(command == "bootstrap") {
    	log.info('[COMM] Bootstraping extension');
    	await bootstrap();
    	return env;
    } 
	
	// example async response
	if(command == 'infosDelayed') {
		return new Promise(resolve => {
	      	setTimeout(() => {
	        	resolve({version: '0.0.1', nodeAvailable: false});
	      	}, 500);
	    });
	}
	
	return {error: 'Unknown command', command}; // Noob
}


var onTabChange = (tabInfo) => {
	//console.log('onTabChange', tabInfo);
	env.config.currentTab = tabInfo.tabId;
	if(exists(env.config.tabFiles[tabInfo.tabId]) && objLen(env.config.tabFiles[tabInfo.tabId]) > 0) {
		chrome.browserAction.setBadgeText({text: objLen(env.config.tabFiles[tabInfo.tabId]).toString()});
		return;
	} else if(env.config.tabFilesProcessing[tabInfo.tabId] == true) {
		chrome.browserAction.setBadgeText({text: '?'});
		return;
	}
	chrome.browserAction.setBadgeText({text: ''});
}

var onTabRemove = (tabId) => {
	//console.log('onTabRemove', tabId);
	delete env.config.tabLinks[tabId];
	delete env.config.tabFiles[tabId];
}

var onTabUpdate = (tabId, changeInfo) => {
	if(exists(changeInfo.url)) {
		//console.log('onTabUpdate', tabId, changeInfo);
		delete env.config.tabLinks[tabId];
		delete env.config.tabFiles[tabId];
		chrome.browserAction.setBadgeText({text: ''});
	}
}