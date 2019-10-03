if(!window.alldExtensionBlackbar) {
    window.alldExtensionBlackbar = true;

	chrome.runtime.sendMessage({command: 'env', keys: ['config.imgs', 'config.domain', 'config.hosts.hardRedirect', 'langStore.webext_download_with'], from: 'blackbar'}, (response) => {

		if(!response.imgs)
            return;

        if(!response.domain) // Fallback
        	response.domain = 'com';

        var hardRedirect = response.hardRedirect;
	    var currentUrl = window.location.href;
	    
	    var config = {
	    	imgs: response.imgs,
	    	domain: response.domain
	    };

	    // Forced redirection hosts handling
	    for(var i in hardRedirect) {
			if(currentUrl.indexOf('://' + hardRedirect[i] + '/download') !== -1) {
				currentUrl = currentUrl.substr(0, currentUrl.length - 8) + getCookie('file_code');
			}
		}

		var newdiv = document.createElement("div");
		newdiv.setAttribute("style","position:absolute;top:0px;left:0px;right:0px;font-size:12px;font-family: Helvetica, Tahoma, Arial, Verdana, sans-serif;color:#fff;font-weight:bold;height:30px;line-height:30px;background:#000 url('" + config.imgs.blackbarBlock + "');z-index:10000;opacity: 0.90;");
		newdiv.setAttribute("id","alldebrid_horiz_div");
		
		var newimg = document.createElement("img");
		newimg.setAttribute("style","margin-right:10px; height: 29px");
		newimg.align = "left";
		newimg.src = config.imgs.alldLogo;
		newdiv.appendChild(newimg);
		
		var newp = document.createElement("p");
		newp.setAttribute("style","color:#FFFFFF; cursor: pointer; line-height: 12px; margin: 8px");

		newp.addEventListener("click", function() { window.location.replace("http://alldebrid." + config.domain + "/service/?url=" + encodeURIComponent(currentUrl)); }, false);
		
		var newtext = document.createTextNode(response['webext_download_with'] + ' ');
		newp.appendChild(newtext);
		
		var newspan = document.createElement("span");
		newspan.setAttribute("style","color:#f00;text-decoration:none");
		newspan.appendChild(document.createTextNode("Alldebrid"));
		newp.appendChild(newspan);
			
		newdiv.appendChild(newp);
		
			
		//var newdiv2 = document.createElement("div");
		//newdiv2.setAttribute("style","position:relative;left:0px;right:0px;font-size:12px;font-family: Helvetica, Tahoma, Arial, Verdana, sans-serif;color:#fff;font-weight:bold;height:30px;line-height:30px;");
		//newdiv2.id = "alldebrid_horiz_div2";

		document.body.insertBefore(newdiv,document.body.getElementsByTagName("*")[0]);
		//document.body.insertBefore(newdiv2,document.body.getElementsByTagName("*")[0]);
		document.body.style.backgroundPosition = "center 30px";
    });

    var getCookie = function(name) {
	    var v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
	    return v ? v[2] : null;
	}
}

