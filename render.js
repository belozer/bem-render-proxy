'use strict';

const path = require('path'),
    fs = require('fs'),
    isDev = process.env.NODE_ENV === 'development',
    useCache = !isDev,
    APP_ENV = process.env.APP_ENV,
    DEBUG = process.env.APP_DEBUG,
    DEFAULT_LANG = process.env.DEFAULT_LANG,
    cacheTTL = process.env.CACHE_TTL,
    STATIC_ROOT = process.env.STATIC_ROOT,
    NORMALIZE_FREEZE_URLS = process.env.NORMALIZE_FREEZE_URLS,
    FreezeMap = require('./freeze-map'),
    freezeMapFile = path.resolve(process.env.FREEZE_MAP || ''),
    BUNDLE_FORMAT = process.env.BUNDLE_FORMAT || '{platform}.pages',
    PAGE_FORMAT = process.env.PAGE_FORMAT || 'page_{scope}_{view}',
    BundleScheme = require('./bundle-scheme'),
    bundle = new BundleScheme(BUNDLE_FORMAT, PAGE_FORMAT, STATIC_ROOT);

var cache = {},
    freezeMap = new FreezeMap();

try {
    let map = require.main.require(freezeMapFile);
    freezeMap = new FreezeMap(map , NORMALIZE_FREEZE_URLS);
} catch (e) {
    console.log('unable to load freeze map', '\n', e);
}


function render(req, res, data, context) {
    if(DEBUG && res.statusCode === 500 && APP_ENV === 'local') // FIXME remove this
        return res.send('<pre>' + JSON.stringify(data, null, 4) + '</pre>');

    var query = req.query,
        user = req.user,
        cacheKey = req.url + (context? JSON.stringify(context) : '') + (user? JSON.stringify(user) : ''),
        cached = cache[cacheKey];

        // Выбор бандла и платформы
        bundle.platform = data.platform || 'desktop',
        bundle.scope = data.bundle || '',
        bundle.view = data.page || 'index',

        // Утанавливает url для статики
        data.platform = bundle.platform;
        data.bundleUrl = bundle.baseUrl;
        data.lang  || (data.lang =  DEFAULT_LANG || 'ru');

    recordRenderTime.call(req);

    if(DEBUG && query.json) return res.send('<pre>' + JSON.stringify(data, null, 4) + '</pre>');

    try {
        var bemtreePath = bundle.getFile('bemtree.js', data.lang),
            bemhtmlPath = bundle.getFile('bemhtml.js', data.lang),
            BEMTREE, BEMHTML;

        if(APP_ENV == 'local' && query.rebuild) {
            var exec = require('child_process').execSync;
            exec('./node_modules/.bin/enb make ' + bundle.bundle, { stdio : [0,1,2] });
            console.log('Drop templates cache');
            delete require.cache[require.resolve(bemtreePath)];
            delete require.cache[require.resolve(bemhtmlPath)];
        }

        BEMTREE = require(bemtreePath).BEMTREE,
        BEMHTML = require(bemhtmlPath).BEMHTML;
    } catch (err) {
        console.error(err, err.stack);
        return res.status(424).end(data.bundleUrl + ' error'); // Попытка подключить несуществующий бандл
    }

    if(useCache && cached && (new Date() - cached.timestamp < cacheTTL)) {
        return res.send(cached.html);
    }

    // в dev режиме перечитываем файл каждый раз
    if(DEBUG) {
        console.log('Try to read freeze map', freezeMapFile);
        try {
            let map = JSON.parse(fs.readFileSync(freezeMapFile, 'utf-8'));
            freezeMap = new FreezeMap(map, NORMALIZE_FREEZE_URLS);
        } catch (e) {
            console.log('Unable to load', freezeMapFile, '\n', e);
        }
    }

    var bemtreeCtx = {
        block : 'root',
        context : context,
        // extend with data needed for all routes
        data : Object.assign({}, {
            url : req._parsedUrl
        }, data)
    };

    try {
        BEMTREE.BEMContext.prototype.getFreezed = url => freezeMap.linkTo(url);
        var bemjson = BEMTREE.apply(bemtreeCtx);
    } catch(err) {
        console.error('BEMTREE error', err.stack);
        console.trace('server stack');
        return res.status(500).send(err);
    }

    if(DEBUG && query.bemjson) return res.send('<pre>' + JSON.stringify(bemjson, null, 4) + '</pre>');

    try {
        var html = BEMHTML.apply(bemjson);
    } catch(err) {
        console.error('BEMHTML error', err.stack);
        return res.status(500).send(err);
    }

    useCache && (cache[cacheKey] = {
        timestamp : new Date(),
        html : html
    });

    recordRenderTime.call(res);
    res.send(html);
}

function dropCache() {
    cache = {};
}

function recordRenderTime() {
    this._renderAt = process.hrtime();
}

module.exports = {
    render : render,
    dropCache : dropCache
};
