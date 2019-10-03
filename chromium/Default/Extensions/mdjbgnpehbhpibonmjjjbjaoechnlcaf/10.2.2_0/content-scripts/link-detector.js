if(!window.alldExtensionDetector) {
    window.alldExtensionDetector = true;

    // listen to mouse over and selection, and enable/disable context menu and autoPopup accordingly

    var popupEnabled;
    var findLinksEnabled;

    var lastSelection = false;
    var lastHref = false;

    var contextUnlock = false;
    var contextSelection = false;

    var newdiv = document.createElement("div");

    // Listen on mouseover to enable / disable unlock link context menu dynamically. Really need an onBeforeShow...
    window.addEventListener('mouseover', (event) => {
        // Only check is valid link and not same as before
        // Try find link href
        var href = false;
        var target = event.target;

        if(typeof target.href == 'string')
            href = target.href;
        else if(target.parentNode !== null && typeof target.parentNode.href == 'string') // Also try one level up
            href = target.parentNode.href;
        
        if(href !== false && lastHref != href) {
            lastHref = href;
            chrome.runtime.sendMessage({command: "checkLink", payload: href}, function(isValid) {
                contextUnlock = isValid;
                if (chrome.runtime.lastError) { 
                    //console.log(chrome.runtime.lastError)
                }
            });
        }
        return;
    }, true);

    // Get env, and start content script
    chrome.runtime.sendMessage({command: 'env', keys: ['options.autoPopup', 'options.findPageLinks'], from: 'hover'}, (response) => {
        console.log(response);
        popupEnabled = response.autoPopup;
        findLinksEnabled = response.findPageLinks;

        window.addEventListener("mouseup", onSelectionHover, true);

        if(findLinksEnabled) {
            var pageContent = document.body.innerHTML;
            // if enabled, parse page content to find valid files
            chrome.runtime.sendMessage({command: "findLinks", payload: pageContent}, function(result) {
                //console.log('has links', result);
            });
        }
    });

    var onSelectionHover = (e) => {
        setTimeout(() => { 
            var html = getSelectionHtml(); 

            // Same selection, noop
            if(html == lastSelection) {
                return;
            }

            lastSelection = html;

            destroyPopup();

            // Empty selection, disable selection context menu
            if(html == '') {
                
                chrome.runtime.sendMessage({command: "emptySelection", enable: false}, function(res) {
                    if (chrome.runtime.lastError) { 
                        //console.log(chrome.runtime.lastError)
                    }
                });
                return;
            }

            var posLeft = e.pageX - 113;
            var posTop = e.pageY - 12;

            chrome.runtime.sendMessage({command: "checkSelection", payload: html}, function(isValid) {
                if (chrome.runtime.lastError) { 
                    //console.log(chrome.runtime.lastError)
                }
                contextSelection = isValid;
                if(isValid == true) { // Selection has supported link, 
                    // Create popup if user activated the feature
                    if(popupEnabled == true) {
                       setTimeout(function(){ createPopup(posTop, posLeft);  }, 250);
                    }
                }
            });

            return; 
        }, 50); 
    }

    var createPopup = (posTop, posLeft) => {
        var newdiv = document.createElement("div");
        newdiv.setAttribute("class","alldebrid_hover");
        newdiv.innerHTML = "<img src='data:image/png;base64,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' />";
        newdiv.setAttribute("style","display: none; width; 153px; height: 24px; cursor: pointer; position: absolute;");
        document.body.appendChild(newdiv);
        newdiv.addEventListener("click", downloadSelection);
        newdiv.setAttribute("style","display: block; width; 153px; height: 24px; cursor: pointer; position: absolute; top: " + posTop + "px; left: " + posLeft + "px;");
    }

    var destroyPopup = () => {

        var hovers = document.getElementsByClassName('alldebrid_hover');
        while(hovers.length > 0){
            hovers[0].parentNode.removeChild(hovers[0]);
        }
    }

    var getSelectionHtml = () => {
        var html = "";
        if (typeof window.getSelection != "undefined") {
            var sel = window.getSelection();
            if (sel.rangeCount) {
                var container = document.createElement("div");
                for (var i = 0, len = sel.rangeCount; i < len; ++i) {
                    container.appendChild(sel.getRangeAt(i).cloneContents());
                }
                html = container.innerHTML;
            }
        } else if (typeof document.selection != "undefined") {
            if (document.selection.type == "Text") {
                html = document.selection.createRange().htmlText;
            }
        }
        return html;
    }

    var downloadSelection = (e) =>  {
        // Trigguer download on selection, from autoPopup
        chrome.runtime.sendMessage({command: "processSelection", payload: getSelectionHtml()}, function(res) {
            if (chrome.runtime.lastError) { 
                //console.log(chrome.runtime.lastError)
            }
        });
    }

    chrome.runtime.onMessage.addListener( (message, sender, sendResponse) => {
        // User-initiated page scan
        if(message.command == 'manualScan') {
            var pageContent = document.body.innerHTML;
            var response = {payload: pageContent};
            sendResponse(response);
            return true;
        }
    });
}