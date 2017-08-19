var MapOrSimilar = require('map-or-similar');

module.exports = function (limit, normalizerFn) {
	var cache = new MapOrSimilar(process.env.FORCE_SIMILAR_INSTEAD_OF_MAP === 'true'),
		lru = [];

  if (normalizerFn === undefined) {
    normalizerFn = function (obj) { return obj; };
  }

	return function (fn) {
		var memoizerific = function () {
			var currentCache = cache,
				newMap,
				fnResult,
				argsLengthMinusOne = arguments.length - 1,
				lruPath = Array(argsLengthMinusOne + 1),
				isMemoized = true,
				i;

			if ((memoizerific.numArgs || memoizerific.numArgs === 0) && memoizerific.numArgs !== argsLengthMinusOne + 1) {
				throw new Error('Memoizerific functions should always be called with the same number of arguments');
			}

			// loop through each argument to traverse the map tree
			for (i = 0; i < argsLengthMinusOne; i++) {
				var key = normalizerFn(arguments[i]);
				lruPath[i] = {
					cacheItem: currentCache,
					arg: key
				};

				// climb through the hierarchical map tree until the second-last argument has been found, or an argument is missing.
				// if all arguments up to the second-last have been found, this will potentially be a cache hit (determined later)
				if (currentCache.has(key)) {
					currentCache = currentCache.get(key);
					continue;
				}

				isMemoized = false;

				// make maps until last value
				newMap = new MapOrSimilar(process.env.FORCE_SIMILAR_INSTEAD_OF_MAP === 'true');
				currentCache.set(key, newMap);
				currentCache = newMap;
			}

			var key = normalizerFn(arguments[argsLengthMinusOne]);
			// we are at the last arg, check if it is really memoized
			if (isMemoized) {
				if (currentCache.has(key)) {
					fnResult = currentCache.get(key);
				}
				else {
					isMemoized = false;
				}
			}

			// if the result wasn't memoized, compute it and cache it
			if (!isMemoized) {
				fnResult = fn.apply(null, arguments);
				currentCache.set(key, fnResult);
			}

			// if there is a cache limit, purge any extra results
			if (limit > 0) {
				lruPath[argsLengthMinusOne] = {
					cacheItem: currentCache,
					arg: key
				};

				if (isMemoized) {
					moveToMostRecentLru(lru, lruPath);
				}
				else {
					lru.push(lruPath);
				}

				if (lru.length > limit) {
					removeCachedResult(lru.shift());
				}
			}

			memoizerific.wasMemoized = isMemoized;
			memoizerific.numArgs = argsLengthMinusOne + 1;

			return fnResult;
		};

		memoizerific.limit = limit;
		memoizerific.wasMemoized = false;
		memoizerific.cache = cache;
		memoizerific.lru = lru;

		return memoizerific;
	};
};

// move current args to most recent position
function moveToMostRecentLru(lru, lruPath) {
	var lruLen = lru.length,
		lruPathLen = lruPath.length,
		isMatch,
		i, ii;

	for (i = 0; i < lruLen; i++) {
		isMatch = true;
		for (ii = 0; ii < lruPathLen; ii++) {
			if (!isEqual(lru[i][ii].arg, lruPath[ii].arg)) {
				isMatch = false;
				break;
			}
		}
		if (isMatch) {
			break;
		}
	}

	lru.push(lru.splice(i, 1)[0]);
}

// remove least recently used cache item and all dead branches
function removeCachedResult(removedLru) {
	var removedLruLen = removedLru.length,
		currentLru = removedLru[removedLruLen - 1],
		tmp,
		i;

	currentLru.cacheItem.delete(currentLru.arg);

	// walk down the tree removing dead branches (size 0) along the way
	for (i = removedLruLen - 2; i >= 0; i--) {
		currentLru = removedLru[i];
		tmp = currentLru.cacheItem.get(currentLru.arg);

		if (!tmp || !tmp.size) {
			currentLru.cacheItem.delete(currentLru.arg);
		} else {
			break;
		}
	}
}

// check if the numbers are equal, or whether they are both precisely NaN (isNaN returns true for all non-numbers)
function isEqual(val1, val2) {
	return val1 === val2 || (val1 !== val1 && val2 !== val2);
}
