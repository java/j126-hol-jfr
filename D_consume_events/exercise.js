
var base = location.origin;
var logTarget = null;

function setLogTarget(el) {
    logTarget = el || null;
}

function log() {
    var ts = '[' + new Date().toLocaleTimeString() + ']';
    var args = Array.prototype.slice.call(arguments);
    try {
        console.log.apply(console, [ts].concat(args));
    } catch (_) {
        // no-op if console is unavailable
    }
    if (logTarget && logTarget.appendChild) {
        var line = document.createElement('div');
        line.textContent = ts + ' ' + args.map(function (v) {
            return String(v);
        }).join(' ');
        logTarget.appendChild(line);
        // keep the newest entry in view
        if (typeof logTarget.scrollTop === 'number') {
            logTarget.scrollTop = logTarget.scrollHeight;
        }
    }
}

function join(path) {
    return new URL(path, base).toString();
}

function toDoc(text) {
    return new DOMParser().parseFromString(text, 'text/html');
}

function get(path) {
    return fetch(join(path), {credentials: 'same-origin'}).then(function (res) {
        return res.text().then(function (text) {
            log('GET', path, '->', res.status, res.url);
            return {res: res, text: text, doc: toDoc(text)};
        });
    });
}

function safeGet(path) {
    return get(path).catch(function () {
        return null;
    });
}

// Load a form page, keep hidden inputs (incl. CSRF), submit with overrides
function submitForm(formPath, overrides) {
    overrides = overrides || {};
    return get(formPath).then(function (formPage) {
        var doc = formPage.doc;
        var form = doc.querySelector('form');
        if (!form) {
            throw new Error('No form found at ' + formPath);
        }

        var params = new URLSearchParams();

        function addField(name, value) {
            if (!name) {
                return;
            }
            params.append(name, value == null ? '' : String(value));
        }

        var els = doc.querySelectorAll('input, select, textarea');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var name = el.getAttribute('name');
            if (!name) {
                continue;
            }

            if (el.tagName === 'INPUT') {
                var type = (el.getAttribute('type') || 'text').toLowerCase();
                if (type === 'checkbox' || type === 'radio') {
                    if (el.checked) {
                        addField(name, el.value || 'on');
                    }
                } else {
                    addField(name, el.value || '');
                }
            } else if (el.tagName === 'SELECT') {
                if (el.multiple) {
                    for (var j = 0; j < el.options.length; j++) {
                        var opt = el.options[j];
                        if (opt.selected) {
                            addField(name, opt.value);
                        }
                    }
                } else {
                    addField(name, el.value || '');
                }
            } else {
                addField(name, el.value || '');
            }
        }

        // Apply overrides
        for (var k in overrides) {
            if (!Object.prototype.hasOwnProperty.call(overrides, k)) {
                continue;
            }
            params.delete(k);
            var v = overrides[k];
            if (Object.prototype.toString.call(v) === '[object Array]') {
                for (var a = 0; a < v.length; a++) {
                    params.append(k, v[a]);
                }
            } else {
                params.append(k, v);
            }
        }

        var action = form.getAttribute('action') || formPath;
        var method = (form.getAttribute('method') || 'post').toUpperCase();
        var targetUrl = new URL(action, formPage.res.url).toString();

        return fetch(targetUrl, {
            method: method,
            credentials: 'same-origin',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: params.toString(),
            redirect: 'follow'
        }).then(function (res) {
            return res.text().then(function (text) {
                log('SUBMIT', formPath, '->', res.status, res.url);
                if (!res.ok) {
                    log('WARN', 'Non-2xx response from', targetUrl, 'status=', res.status);
                }
                return {res: res, text: text, doc: toDoc(text)};
            });
        });
    });
}

function extractOwnerId(obj) {
    var url = (obj && obj.res && obj.res.url) || '';
    var m = url.match(/\/owners\/(\d+)(?:[\/?#]|$)/);
    if (m) {
        return parseInt(m[1], 10);
    }
    m = obj && obj.text ? obj.text.match(/\/owners\/(\d+)(?:[^0-9]|$)/) : null;
    return m ? parseInt(m[1], 10) : null;
}

function extractPetIdFromOwnerPage(text) {
    // Match any '/pets/{id}/edit' regardless of preceding path (absolute or relative)
    var m = text.match(/\/pets\/(\d+)\/edit\b/);
    return m ? parseInt(m[1], 10) : null;
}

function run() {
    if (typeof fetch !== 'function' || typeof URLSearchParams === 'undefined') {
        var msg = 'Your browser lacks required features (fetch/URLSearchParams). Use a modern Chrome/Edge/Firefox.';
        log('ERROR', msg);
        throw new Error(msg);
    }

    log('Starting Spring Petclinic path exercise on', base);

    var ctx = {ownerId: null, petId: null};

    return get('/')
        .then(function () {
            return get('/owners/find');
        })
        .then(function () {
            return get('/owners?lastName=');
        })
        .then(function () {
            return get('/vets');
        })
        .then(function () {
            return get('/vets.html');
        })
        .then(function () {
            return safeGet('/oups');
        })
        .then(function () {
            return safeGet('/error');
        })
        .then(function () {
            return safeGet('/actuator/health');
        })
        .then(function () {
            log('Creating Owner...');
            return submitForm('/owners/new', {
                firstName: 'Alice',
                lastName: 'Tester',
                address: '1 Infinite Loop',
                city: 'Testville',
                telephone: '1234567890'
            });
        })
        .then(function (ownerCreate) {
            ctx.ownerId = extractOwnerId(ownerCreate);
            if (ctx.ownerId) {
                return null;
            }
            return get('/owners?lastName=Tester').then(function (page) {
                ctx.ownerId = extractOwnerId(page);
                return null;
            });
        })
        .then(function () {
            if (!ctx.ownerId) {
                throw new Error('Could not determine Owner ID');
            }
            log('Owner ID =', ctx.ownerId);
            log('Editing Owner...');
            return submitForm('/owners/' + ctx.ownerId + '/edit', {
                firstName: 'Alice',
                lastName: 'Tester',
                address: '123 Main St',
                city: 'Testville',
                telephone: '1234567890'
            });
        })
        .then(function () {
            log('Creating Pet...');
            return submitForm('/owners/' + ctx.ownerId + '/pets/new', {
                name: 'Whiskers',
                birthDate: (new Date(new Date().setFullYear(new Date().getFullYear() - 1))).toISOString().slice(0, 10),
                'type.id': '1'
            });
        })
        .then(function (petCreate) {
            ctx.petId = extractPetIdFromOwnerPage(petCreate.text);
            if (ctx.petId) {
                return null;
            }
            return get('/owners/' + ctx.ownerId).then(function (ownerPage) {
                ctx.petId = extractPetIdFromOwnerPage(ownerPage.text);
                return null;
            });
        })
        .then(function () {
            if (!ctx.petId) {
                throw new Error('Could not determine Pet ID');
            }
            log('Pet ID =', ctx.petId);
            log('Editing Pet...');
            return submitForm('/owners/' + ctx.ownerId + '/pets/' + ctx.petId + '/edit', {
                name: 'Whiskers-II',
                birthDate: (new Date(new Date().setFullYear(new Date().getFullYear() - 2))).toISOString().slice(0, 10),
                'type.id': '1'
            });
        })
        .then(function () {
            log('Adding Visit...');
            return submitForm('/owners/' + ctx.ownerId + '/pets/' + ctx.petId + '/visits/new', {
                date: (new Date()).toISOString().slice(0, 10),
                description: 'Routine check'
            });
        })
        .then(function () {
            return get('/owners/' + ctx.ownerId)
                .then(function () {
                    return get('/owners/find');
                })
                .then(function () {
                    return get('/owners?lastName=Test');
                })
                .then(function () {
                    return get('/vets');
                })
                .then(function () {
                    return get('/vets.html');
                });
        })
        .then(function () {
            log('Completed Spring Petclinic path exercise.');
            return true;
        })
        .catch(function (e) {
            log('ERROR', 'Script failed:', e.message || e);
            throw e;
        });
}
