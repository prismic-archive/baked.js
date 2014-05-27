## 0.0.4

### Feature

- The dynamic mode is now based on the HTTP server fcc604c
  - custom routes are honored in this mode too 985ff16
  - `url_to` now accepts global paths (“`/index`” for instance) b59834a
- It is now possible to specify an `access_token` and a `ref` in the queryString 48b8a58

### Incompatible changes

- Split tasks “`gulp`” and “`gulp dev`” 42b4ada

## 0.0.3

### Feature

- Add HTTP server to serve generated file ea5783a 269cb9b
  - the generation is automatically performed when content is modified

### Incompatible changes

- Replace Grunt by Gulp 269cb9b
- ⚠ baked.js can now be runned using `node generate.js <src> <dst>` or `gulp` 8c01c77
  - the old way (`node src/server.js <src> <dst>`) is not working anymore
- remove `.html` from generated files 63be33b

### Fix

- Fix query escape pattern (`$$` was not escaping) f7a03e9
- baked: Queries can now refer to bookmarks ed9fad9
