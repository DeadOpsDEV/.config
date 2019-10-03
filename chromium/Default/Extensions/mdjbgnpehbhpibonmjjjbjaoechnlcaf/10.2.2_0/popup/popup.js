var env = {
	'user': {},
	'options': {},
	'config': {},
	'langStore': {}
};

// Goddamn front-end shitty JS. Go die. 
// Don't expect too much comm'



(async function() {

	// Get needed env data
	var response = await browser.runtime.sendMessage({command: 'env', keys: ['config', 'user', 'langStore', 'options'], from: 'popup'});

	env.config = response.config;
	env.user  = response.user;
	env.options  = response.options;
	env.langStore  = response.langStore;

	var objects = document.getElementsByTagName('*'), i;
	for(i = 0; i < objects.length; i++) {
		if (objects[i].dataset && objects[i].dataset.lang) {
			objects[i].innerText = lang(objects[i].dataset.lang);
		}
	}

	var [error, isLoggued] = await browser.runtime.sendMessage({command: 'isLoggued', from: 'popup'});

	if(!isLoggued) {
		// Not loggued, displaying guest content
		hide('.loggued');
		show('.guest');
		return;
	} else {
		// Loggued
		if(!exists(env.config.hosts.lastUpdate)) {// We loggued for first time, let's bootstrap the extension
			var response = await browser.runtime.sendMessage({command: 'bootstrap', from: 'popup'});

			env.config = response.config;
			env.user  = response.user;
			env.options  = response.options;
			env.langStore  = response.langStore;
		}	
	}

	dom('#username').innerText = env.user.username;
	dom('#accountLink').href = 'https://alldebrid.' + env.config.domain + '/account/';

	browser.tabs.query({'active': true, 'lastFocusedWindow': true}).then((tabs) =>  {

		if(tabs.length == 0)
			return;

		var url = tabs[0].url;

		if(isValidHostLink(url)) {
			hide('#logoLink');
			show('#logoSendToAlld', true);

			listen('#logoSendToAlld', 'click', () => {
				browser.tabs.create({ url: 'https://alldebrid.' + env.config.domain + '/service/?url=' + encodeURIComponent(url)});
			});
		}
	});


	dom('#logoLink').href = 'https://alldebrid.' + env.config.domain;

	if(env.user.isPremium == false) {
	 	document.getElementById('notPremium').style.display = 'block';
		var elem = document.getElementById('premiumUntil');
		elem.textContent = lang('premium_expired');
		var a = document.createElement('a');
		elem.appendChild(a);
		a.target = '_blank';
		a.textContent = ' ' + lang('premium_renew') + ' ?';
		a.href = "https://alldebrid." + env.config.domain + "/offer/";
		show('.disabledFeatures');
	} else {
		var remainingPremiumDays = Math.round((env.user.premiumUntil - Math.floor(Date.now() / 1000) ) / 60 / 60 / 24);
		dom('#premiumUntil').innerText = lang('premium_expire_in') + ' ' + remainingPremiumDays + ' ' + lang('days');
	}

	if(env.config.client.os == 'win') {
		show('.winQuickInstall');
	}
	
	// Init UI
	var select = document.getElementById('hosts');
	env.config.hosts.hostList.forEach( (host) => {
		var opt = document.createElement('option');
		opt.value = host;
		opt.appendChild(document.createTextNode(host));
		select.appendChild(opt);

		if(env.options.disabledHosts == true && env.options.disabledHostsList.indexOf(host) !== -1) {
			opt.hidden = true;
			dom('#disabledHostList').appendChild(createChip('host', host));
		}	
    });
    env.config.hosts.folderList.forEach( (host) => {
		var opt = document.createElement('option');
		opt.value = host;
		opt.appendChild(document.createTextNode(host));
		select.appendChild(opt);

		if(env.options.disabledHosts == true && env.options.disabledHostsList.indexOf(host) !== -1) {
			opt.hidden = true;
			dom('#disabledHostList').appendChild(createChip('host', host));
		}	
    });

	select = document.getElementById('streams');
    env.config.hosts.streamList.forEach( (stream) => {
    	var opt = document.createElement('option');
		opt.value = stream;
		opt.appendChild(document.createTextNode(stream));
		select.appendChild(opt);
    	if(env.options.enabledStreamList.indexOf(stream) !== -1) {
    		opt.hidden = true;
			dom('#enabledStreamList').appendChild(createChip('stream', stream));
		}		
    });

    if(env.options.customSources.length > 0) {
		env.options.customSources.forEach((pattern) => {
			var li = document.createElement('li');
				
			var deleteBtn = document.createElement('span');
			deleteBtn.classList.add("delete");
			deleteBtn.addEventListener('click', onCustomSourceDelete);

			li.innerText = pattern;
			li.prepend(deleteBtn);

			dom('#currentCustomPatterns ul').appendChild(li);	
		});
	} else {
		var li = document.createElement('li');
		li.innerText = '(No custom source yet)';
		dom('#currentCustomPatterns ul').appendChild(li);	
	}

	if(env.config.client.features.liveNotif == false)
		hide('.liveNotifEnabled');

	if(env.options.changeLink == true)
		dom('#changeLink').checked = true;
	if(env.options.blackBar == true)
		dom('#blackBar').checked = true;
	if(env.options.autoPopup == true)
		dom('#autoPopup').checked = true;
	if(env.options.findPageLinks == true)
		dom('#findPageLinks').checked = true;
	if(env.options.replaceStreamSource == true)
		dom('#replaceStreamSource').checked = true;		
	if(env.options.riverLiveNotif == true)
		dom('#riverLiveNotif').checked = true;
	if(env.options.riverCompletionNotif == true)
		dom('#riverCompletionNotif').checked = true;

	

	if(env.options.riverCustomSource == true) {
		dom('#riverCustomSource').checked = true;
		if(env.config.rivers.isLearning == true) {
			show('#addCustomSource, #customRiverSourceList, #customSourceLearning, #currentCustomPatterns');

			if(env.config.rivers.learnLinks.length < 2) {
				show('#needMoreSources');

				env.config.rivers.learnLinks.forEach((link) => {
					var li = document.createElement('li');
					li.innerText = link;
					dom('#needMoreSources ul').appendChild(li);	
				});
				dom('#nbCustomSources').innerText = env.config.rivers.learnLinks.length;
			} else {
				show('#resultsFromLearning');

				env.config.rivers.learnLinks.forEach((link) => {
					var li = document.createElement('li');
					li.innerText = link;
					dom('#resultsFromLearning ul').appendChild(li);	
				});

				var common = sharedStart(env.config.rivers.learnLinks);

				if(common.length > 10) {
					dom('#resultsFromLearning input').value = common + '*';
					show('#resultsFromLearningAdd', true);
				} else {
					show('#notCommonFound', true);
				}
			}
		}
		else {
			show('#addCustomSource, #customRiverSourceList, #customSourceNotLearning, #currentCustomPatterns');
		}
	}

	if(env.options.disabledHosts == true) {
		dom('#disabledHosts').checked = true;
		show('#disabledHostersBox, #disabledHostList');
	}
	if(env.options.enabledStream == true) {
		dom('#enabledStream').checked = true;
		show('#enabledStreamBox, #enabledStreamList');
	}

	var currentTab = await storage.get('popupTab');

	if( (env.options.findPageLinks == true && Array.isArray(env.config.tabLinks[env.config.currentTab]) && env.config.tabLinks[env.config.currentTab].length > 0) || objLen(env.config.tabFiles[env.config.currentTab]) > 0) {
		renderPageFiles(env.config.tabFiles[env.config.currentTab]);
		dom('#tab0').checked = true;
	}
	else if(currentTab !== undefined)
		dom('#' + currentTab).checked = true;
	else
		dom('#tab1').checked = true;

	listen('.tabHead', 'click', (event) => {
		var label = event.target;

		if(typeof label.dataset.id == 'undefined')
			label = label.parentNode;

		storage.set({popupTab: label.dataset.id});
	});

	listen('#pageLinksScan', 'click', async (event) => {

		hide('#pageLinksScanReload');
		hide('#fileListTitle');

		dom('#fileListTitle fileListTitle').innerText = "";

		show('#fileListLoading');

		var fileList = dom('#pageLinksList #fileList');

		while (fileList.firstChild) {
		    fileList.removeChild(fileList.firstChild);
		}

		var now = Date.now();

		dom('#pageLinksScan span.greenBtn').innerText = 'Scanning...';

		var response = await browser.runtime.sendMessage({command: 'manualFindLinks', from: 'popup'});

		//console.log('Manual scan response', response);

		if(!Array.isArray(response)) {
			if(response.error == 'reload') {
				show('#pageLinksScanReload');
				dom('#pageLinksScan span.greenBtn').innerText = 'Re-scan page';
				return;
			}
		}

		env.config.tabLinks[env.config.currentTab] = response;
		
		if(env.config.tabLinks[env.config.currentTab].length > 0) {
			renderPageFiles(env.config.tabFiles[env.config.currentTab]);
		} else {
			var elapsed = Date.now() - now;

			if(elapsed > 500)
				dom('#pageLinksScan span.greenBtn').innerText = 'Re-scan page';
			else
				setTimeout(() => {
					dom('#pageLinksScan span.greenBtn').innerText = 'Re-scan page';
				}, (500 - elapsed));
		}
	});

	listen('#changeLink', 'change', () => {
		var checked = dom('#changeLink').checked;
		settings({'changeLink': checked});
		env.options.changeLink = checked;
	});

	listen('#blackBar', 'change', () => {
		var checked = dom('#blackBar').checked;
		settings({'blackBar': checked});
		env.options.blackBar = checked;
	});

	listen('#autoPopup', 'change', () => {
		var checked = dom('#autoPopup').checked;
		settings({'autoPopup': checked});
		env.options.autoPopup = checked;
	});

	listen('#findPageLinks', 'change', () => {
		var checked = dom('#findPageLinks').checked;
		settings({'findPageLinks': checked});
		env.options.findPageLinks = checked;
	});

	listen('#replaceStreamSource', 'change', () => {
		var checked = dom('#replaceStreamSource').checked;
		settings({'replaceStreamSource': checked});
		env.options.replaceStreamSource = checked;
	});

	listen('#riverLiveNotif', 'change', () => {
		var checked = dom('#riverLiveNotif').checked;
		settings({'riverLiveNotif': checked});
		env.options.riverLiveNotif = checked;
	});

	listen('#riverCompletionNotif', 'change', () => {
		var checked = dom('#riverCompletionNotif').checked;
		settings({'riverCompletionNotif': checked});
		env.options.riverCompletionNotif = checked;
	});

	listen('#riverCustomSource', 'change', () => {
		var checked = dom('#riverCustomSource').checked;
		settings({'riverCustomSource': checked});
		env.options.riverCustomSource = checked;

		if(checked) {
			show('#addCustomSource, #customRiverSourceList, #customSourceNotLearning, #currentCustomPatterns');
		}
		else {
			hide('#addCustomSource, #customRiverSourceList, #customSourceNotLearning, #currentCustomPatterns');

			if(env.config.rivers.isLearning == true) {
				env.config.rivers.isLearning = false;
				env.config.rivers.learnLinks = [];
				hide('#customSourceLearning');
				browser.runtime.sendMessage({command: 'toggleLearning', value: false, from: 'popup'});
			}	
		}
	});

	listen('#customSourceNotLearning button', 'click', () => {
		hide('#customSourceNotLearning');
		show('#customSourceLearning');
		env.config.rivers.isLearning = true;
		browser.runtime.sendMessage({command: 'toggleLearning', value: true, from: 'popup'});
	});

	listen('#customSourceLearning button', 'click', () => {
		hide('#customSourceLearning');
		show('#customSourceNotLearning');
		env.config.rivers.isLearning = false;
		env.config.rivers.learnLinks = [];
		dom('#resultsFromLearning input').value = '';
		hide('#notCommonFound');
		var customSourceUl = dom('#resultsFromLearning ul');
		while (customSourceUl.firstChild) {
		    customSourceUl.removeChild(customSourceUl.firstChild);
		}
		browser.runtime.sendMessage({command: 'toggleLearning', value: false, from: 'popup'});
	});

	listen('#resultsFromLearning .add', 'click', async () => {
		var pattern = dom('#resultsFromLearning input').value;

		var isPatternValid = await browser.runtime.sendMessage({command: 'testPattern', pattern});

		if(!isPatternValid) {
			show('#patternNotValid');
			setTimeout(() => { hide('#patternNotValid'); }, 5000);
			return;
		}

		var response = await browser.runtime.sendMessage({command: 'addCustomSource', pattern, from: 'popup'});

		hide('#customSourceLearning');
		show('#customSourceNotLearning');

		if(response == true) {
			env.options.customSources.push(pattern);
			// Added with success
			var customSourceUl = dom('#currentCustomPatterns ul');
			while (customSourceUl.firstChild) {
			    customSourceUl.removeChild(customSourceUl.firstChild);
			}
			if(env.options.customSources.length > 0) {
				env.options.customSources.forEach((pattern) => {
					var li = document.createElement('li');
					
					var deleteBtn = document.createElement('span');
					deleteBtn.classList.add("delete");
					deleteBtn.addEventListener('click', onCustomSourceDelete);

					li.innerText = pattern;
					li.prepend(deleteBtn);

					customSourceUl.appendChild(li);	
				});
			} else {
				var li = document.createElement('li');
				li.innerText = '(No custom source yet)';
				customSourceUl.appendChild(li);	
			}
		}
	});

	listen('#disabledHosts', 'change', () => {
		var checked = dom('#disabledHosts').checked;
		settings({'disabledHosts': checked});
		env.options.disabledHosts = checked;
		
		if(checked)
			show('#disabledHostersBox, #disabledHostList');
		else
			hide('#disabledHostersBox, #disabledHostList');
	});

	listen('#enabledStream', 'change', () => {
		var checked = dom('#enabledStream').checked;
		settings({'enabledStream': checked});
		env.options.changeLink = checked;

		if(checked)
			show('#enabledStreamBox, #enabledStreamList');
		else
			hide('#enabledStreamBox, #enabledStreamList');
	});

	listen('#disabledHostersBox .add', 'click', () => {
		var host = dom('#hosts').value;

		settings({'disabledHostsList': {'add' : host}});
		env.options.disabledHostsList.push(host);

		dom('#hosts').options[dom('#hosts').selectedIndex].hidden = true;
		dom('#disabledHostList').appendChild(createChip('host', host));

		var i = 0;
		do {
			if(dom('#hosts').options[i].hidden == false) {
				dom('#hosts').selectedIndex = i;
				break;
			}
			i++;
		} while(i < dom('#hosts').options.length);
	});

	listen('#enabledStreamBox .add', 'click', () => {
		var stream = dom('#streams').value;

		settings({'enabledStreamList': {'add' : stream}});
		env.options.enabledStreamList.push(stream);

		dom('#streams').options[dom('#streams').selectedIndex].hidden = true;
		dom('#enabledStreamList').appendChild(createChip('stream', stream));

		var i = 0;
		do {
			if(dom('#streams').options[i].hidden == false) {
				dom('#streams').selectedIndex = i;
				break;
			}
			i++;
		} while(i < dom('#streams').options.length);
	});

	listen('#customPlayerAdd', 'click', async () => {
		var path = dom('#customPlayerInput').value;

		var isPathValid = await native.checkPath(path);

		if(!isPathValid) {
			show('#localPlayersInvalidPath');
			setTimeout(() => { hide('#localPlayersInvalidPath'); }, 5000);
			return;
		}

		var playerName = formatName(path);

		dom('#customPlayerName').innerText = playerName;
		dom('#customPlayerPath').innerText = path;

		hide('#localPlayerNotSet');
		show('#localPlayerSet');
		
		settings({'localPlayer': playerName, 'localPlayerPath': path});
		env.options.localPlayer = playerName;
		env.options.localPlayerPath = path;

		dom('#customPlayerInput').value = '';
	});

	listen('#localPlayersScan', 'click', async () => {

		opacity('.loading', 1);
		var localPlayers = await native.scanLocalPlayers();
		opacity('.loading', 0);

		if(localPlayers.length == 0) {
			show('#localPlayersNotFound');
			return;
		}

		if(localPlayers.length == 1) {
			var path = localPlayers[0];
			var playerName = formatName(path);

			dom('#customPlayerName').innerText = playerName;
			dom('#localPlayersFoundOneName').innerText = playerName;
			dom('#customPlayerPath').innerText = path;

			hide('#localPlayerNotSet');
			show('#localPlayerSet');

			settings({'localPlayer': playerName, 'localPlayerPath': path});
			
			env.options.localPlayer = playerName;
			env.options.localPlayerPath = path;

			show('#localPlayersFoundOne');

			setTimeout(() => { hide('#localPlayersFoundOne'); }, 5000);

			return;
		}

		var customSourceUl = dom('#localPlayersFound ul');
		while (customSourceUl.firstChild) {
		    customSourceUl.removeChild(customSourceUl.firstChild);
		}

		localPlayers.forEach( (playerPath) => {
			var span = document.createElement('span');
			span.append(createIcon('plus', '#90c76f'));
			span.classList.add("add");
			span.addEventListener('click', onLocalPlayerChoose);

			var li = document.createElement('li');
			li.dataset.path = playerPath;
			li.innerText = formatName(playerPath);
			li.prepend(span);

			dom('#localPlayersFound ul').appendChild(li);
		});

		show('#localPlayersFound');
	});

	listen('#disabledHostList .close', 'click', onHostChipClose);
	listen('#enabledStreamList .close', 'click', onStreamChipClose);

	var localStreamVersion = await native.getVersion();

	if(localStreamVersion === false) {
		show('#localStreamDown');
	} else {
		dom('#localScriptVersion').innerText = localStreamVersion.version;
		dom('#nodeVersion').innerText = localStreamVersion.nodeVersion.substring(1);

		if(env.options.localPlayerPath.length > 0) {
			dom('#customPlayerName').innerText = env.options.localPlayer;
			dom('#customPlayerPath').innerText = env.options.localPlayerPath;
			show('#localPlayerSet');
		} else {
			show('#localPlayerNotSet');
		}

		show('#localStreamUp, #localPlayerSelection');
	}


	browser.runtime.onMessage.addListener((request, sender) => {
		//console.log('Got new message', request);

		if(request.command == 'syncPageLinks') {
			//console.log('Syncing');
			env.config.tabFiles[env.config.currentTab] = request.files;
			env.config.tabFilesProcessing[env.config.currentTab] = request.processing;
			renderPageFiles(env.config.tabFiles[env.config.currentTab]);
		}
	});

})();

var renderPageFiles = (files) => {

	if(typeof files != 'object')
		return;

	dom('#pageLinksScan span.greenBtn').innerText = 'Re-scan page';
	hide('#pageLinksNotFound');

	if(env.config.tabFilesProcessing[env.config.currentTab] == false) {
		hide('#fileListLoading');
		show('#fileListTitle');
		dom('#fileListNbFiles').innerText = objLen(files);
	} else {
		if(objLen(files) > 0) {
			show('#fileListTitle');
			dom('#fileListNbFiles').innerText = objLen(files);
		}	
	}

	var fileList = dom('#pageLinksList #fileList');

	while (fileList.firstChild) {
	    fileList.removeChild(fileList.firstChild);
	}

	var allLinks = [];
	var orderedFiles = {};
	Object.keys(files).sort().forEach(function(key) {
	  orderedFiles[key] = files[key];
	});

	objForEach(orderedFiles, (infos, filename) => {
		var div = document.createElement('div');
		div.classList.add("file");

		var divInfos = document.createElement('div');
		divInfos.classList.add("fileInfos");
		divInfos.innerText = filename;

		var spanSize = document.createElement('span');
		spanSize.classList.add("fileSize");
		spanSize.innerText = ' (' + humanFileSize(infos.size) + ')';

		divInfos.append(spanSize);
		
		if(exists(infos.nbParts) && infos.nbParts > 1) {
			var spanParts = document.createElement('span');
			spanParts.classList.add("fileParts");
			spanParts.innerText = ' (in ' + infos.nbParts + ' parts)';
			divInfos.append(spanParts);
		}

		if(exists(infos.nbParts)) {
			objForEach(infos.nbParts, (infosPart, filenameinfosPart) => {
				infosPart.links.forEach((linkInfos) => {
					allLinks.push(linkInfos.link);
				});
			});
		} else {
			infos.links.forEach((linkInfos) => {
				allLinks.push(linkInfos.link);
			});
		}

		div.append(divInfos);

		var divDl = document.createElement('div');
		divDl.classList.add("fileDl");
		var dlIcon = createIcon('download', '#6fb025');

		dlIcon.addEventListener('click', (event) => {
			browser.runtime.sendMessage({command: 'sendPageLink', infos: infos, from: 'popup'});
		});

		divDl.append(dlIcon);

		div.append(divDl);

		fileList.appendChild(div);	
	});

	listen('.fileListDownloadAll', 'click', (event) => {
		browser.runtime.sendMessage({command: 'sendPageAllLinks', links: allLinks, from: 'popup'});
	});


	show('#pageLinksList');
}

// Some helpers so we don't kill ourself just yet
var dom = (selector, transformation) => {

	var elements = document.querySelectorAll(selector);

	if(transformation == null) {
		if(elements.length == 1)
			return elements[0];

		return elements;
	}


	if(elements == null)
		return;

	elements.forEach(transformation);
}

var show = (selector, inline) => {dom(selector, (el) => { 
	if(inline)
		el.style.display = 'inline';
	else
		el.style.display = 'block';
});}
var hide = (selector) => {dom(selector, (el) => { el.style.display = 'none'; });}
var opacity = (selector, opacity) => {dom(selector, (el) => { el.style.opacity = opacity; });}

var listen = (selector, type, callback) => {dom(selector, (el) => { el.addEventListener(type, callback); });}

var createChip = (type, text) => {
	var chip = document.createElement('div');
	chip.classList.add("chip");
	chip.appendChild(document.createTextNode(text));

	var closeBtn = document.createElement('i');
	closeBtn.classList.add("close");
	closeBtn.classList.add("far");
	closeBtn.classList.add("fa-times-octagon");
	
	if(type == 'host')
		closeBtn.addEventListener('click', onHostChipClose);
	else
		closeBtn.addEventListener('click', onStreamChipClose);
	chip.appendChild(closeBtn);

	return chip;
}


var formatName = (path) => {
	var playerName = capitalizeFirstLetter(path.split(/[\\/]/).pop());

	if(env.config.client.os == 'win') {
		playerName = playerName.split('.')[0];
	}
	if(env.config.client.os == 'mac') {
		playerName = playerName.split('.')[0].toLowerCase();
	}


	if(playerName.toLowerCase() == 'vlc')
		playerName = 'VLC';

	if(playerName.toLowerCase() == 'mpc-hc')
		playerName = 'Media Player Classic HC';

	if(playerName.toLowerCase() == 'potplayermini64')
		playerName = 'Pot Player';

	

	return playerName;
}

var createIcon = (name, color) => {

	var icon = document.createElement('i');
	icon.classList.add("fas");
	icon.classList.add("fa-" + name);
	icon.style.marginRight = '4px';

	if(color != null)
		icon.style.color = color;

	return icon;
}

var onHostChipClose = (event) => {
	var chip = event.target.parentElement;
	var host = chip.innerText;

	browser.runtime.sendMessage({command: 'settings', updates: {'disabledHostsList': {'delete' : host}}, from: 'popup'});
	env.options.disabledHostsList.splice(env.options.disabledHostsList.indexOf(host), 1);

	chip.remove();
	dom('#hosts option[value="' + host + '"]').hidden = false;
};

var onStreamChipClose = (event) => {
	var chip = event.target.parentElement;
	var stream = chip.innerText;

	browser.runtime.sendMessage({command: 'settings', updates: {'enabledStreamList': {'delete' : stream}}, from: 'popup'});
	env.options.enabledStreamList.splice(env.options.enabledStreamList.indexOf(stream), 1);

	chip.remove();
};

var onCustomSourceDelete = (event) => {
	var li = event.target.parentElement;
	var customSource = li.innerText;

	browser.runtime.sendMessage({command: 'settings', updates: {'customSources': {'delete' : customSource}}, from: 'popup'});
	env.options.customSources.splice(env.options.customSources.indexOf(customSource), 1);

	li.remove();
};

var onLocalPlayerChoose = (event) => {
	var li = event.target.parentElement.parentElement;
	var path = li.dataset.path;

	var playerName = formatName(path);

	dom('#customPlayerName').innerText = playerName;
	dom('#customPlayerPath').innerText = path;

	hide('#localPlayerNotSet');
	show('#localPlayerSet');

	settings({'localPlayer': playerName, 'localPlayerPath': path});
	
	env.options.localPlayer = playerName;
	env.options.localPlayerPath = path;

	hide('#localPlayersFound');
};

var settings = (updates) => {
	browser.runtime.sendMessage({command: 'settings', updates, from: 'popup'});
}
