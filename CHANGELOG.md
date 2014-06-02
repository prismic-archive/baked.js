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
