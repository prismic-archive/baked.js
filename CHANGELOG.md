### Feature

- Only errors are now displayed by default.
  + (ok this is not an error but it's still cool)
- Add `pathToHere` helper (returns the path of the current page)
- Add `urlTo` and `urlToHere` helpers (return the full URL)
  + do not confuse the new `urlTo` helper
    and the old (badly named) helper `url_to` which returns only a path.
- Add a global configuration file, which handles:
  - the logger level
  - the API's URL
  - the base URL

### Changes

- The `url_to` helper has been renamed into `pathTo`
  + the old version is still supported by deprecated
- Replace `src_dir` and `dst_dir` by `srcDir` and `dstDir`, but it should not break existing gulpfiles
  + the `init()` helper still supports `src_dir` and `dst_dir`
  + the `parseOptions()` helper's response and the `baked.config.options` object have `src_dir` and `dst_dir` as r/w properties.

## 0.0.6

###  Feature

- Templates can now include Javascript files using `require`
  - Theses files are evaluated inside the template context
  - They are cached (but it's possible to bypass the cache)
- Added `clean` task
- Fixed a bug which may block generation

## 0.0.5

### Feature

- Add template partial
  - A partial is a template whose name starts by “_”. It won't be rendered directly (so it doesn't need meta like “prismic-api”) but is included in other
templates using the helper `partial`. (`[%- partial('footer') %]` will include
the partial “_footer.html.erb”)
- Add helper to change ref
- Add OAuth2 authentication
- Use [EJS](https://github.com/visionmedia/ejs) for template rendering
  - Its HTML escaping and filters are available

### Incompatible changes

- Because EJS is now used, every template returning HTML have to be fixed
(by replacing `[%= ... %]` by `[%- ... %]`) in order to stop escaping the HTML
twice.

## 0.0.4

### Feature

- The dynamic mode is now based on the HTTP server
  - custom routes are honored in this mode too
  - `url_to` now accepts global paths (“`/index`” for instance)
- It is now possible to specify an `access_token` and a `ref` in the queryString

### Incompatible changes

- Split tasks “`gulp`” and “`gulp serve`”
- ⚠ Remove the generate.js file
  - Run `gulp --src <src> --dst <dst>` instead

## Fixes

- Non-template HTML files are now copied correctly
- Supports query parameter names using camelcase

## 0.0.3

### Feature

- Add HTTP server to serve generated file
  - the generation is automatically performed when content is modified

### Incompatible changes

- Replace Grunt by Gulp
- ⚠ baked.js can now be runned using `node generate.js <src> <dst>` or `gulp`
  - the old way (`node src/server.js <src> <dst>`) is not working anymore
- remove `.html` from generated files

### Fix

- Fix query escape pattern (`$$` was not escaping)
- baked: Queries can now refer to bookmarks
