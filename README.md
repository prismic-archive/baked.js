Static generator
================

The Picture of Dorian Gray is the only published novel by Oscar Wilde, appearing
as the lead story in Lippincott's Monthly Magazine on 20 June 1890, printed as
the July 1890 issue of this magazine. The magazine's editors feared the story
was indecent as submitted, so they censored roughly 500 words, without Wilde's
knowledge, before publication. But even with that, the story was still greeted
with outrage by British reviewers, some of whom suggested that Wilde should be
prosecuted on moral grounds, leading Wild to defend the novel aggressively in
letters to the British press. Wilde later revised the story for book
publication, making substantial alterations, deleting controversial passages,
adding new chapters, and including an aphoristic preface that has since become
famous in its own right. The amended version was published by Ward Lock & Co in
April 1891. Some scholars, however, favor the original version he originally
submitted to Lippincott's.

The novel tells of a young man named Dorian Gray, the subject of a painting by
artist Basil Hallward. Basil is impressed by Dorian's beauty and becomes
infatuated with him, believing his beauty is responsible for a new mode in his
art. Dorian meets Lord Henry Wotton, a friend of Basil's, and becomes enthralled
by Lord Henry's world view. Espousing a new hedonism, Lord Henry suggests the
only things worth pursuing in life are beauty and fulfilment of the senses.
Realizing that one day his beauty will fade, Dorian (whimsically) expresses a
desire to sell his soul to ensure the portrait Basil has painted would age
rather than he. Dorian's wish is fulfilled, and when he subsequently pursues a
life of debauchery, the portrait serves as a reminder of the effect each act has
upon his soul, with each sin displayed as a disfigurement of his form, or
through a sign of aging.

The Picture of Dorian Gray is considered a work of classic Gothic fiction with a
strong Faustian theme.

![Dorian Gray](http://salmanlatif.files.wordpress.com/2011/08/dorian.jpeg)

## Use

- at the root of the project:
- put your files into `/to_generate/`
- clean `/generated/`
- `node src/server.js`
	- ⇒ generate the static files into `/generated/static/`
	- ⇒ generate the dynamic files (requiring JS) into `/generated/dyn/`
	- you can add options `--debug --no-async` to make it easier to debug
- `grunt`
	- ⇒ generate the JS lib (used by dynamic files)
- cool cool cool

## Notes

- dynamic pages don't have the global map of exiting pages, so:
	- the page a URL `http://host/foo/bar.html` could be
		- the file `foo/bar.html` (if the generated files are put at the root of `host`)
		- the file `bar.html` (if the generated files are put in the dir `foo` of `host`)
	- `url_to` have to be relative (how to link to a global file without knowning what is the origin point?)
	- the custom routes can't be honored, even simple rename (how can we know which route should be used without reading the called file?)
- the server build a DOM structure (using JSDOM) in order to navigate inside it, so:
	- The tags `<% %>` can't be used, because JSDOM don't like them
