# Template generation

`generate-templates.mjs` is the canonical repository-native template generator. It uses the tracked `pdf-lib` dependency, resolves its output directory relative to this repository, and creates interactive PDF forms with AcroForm fields.

`generate-templates.py` is a legacy generator that is retained temporarily because it still owns five unique assets in the active template catalog:

- `statutory-declaration.pdf`
- `centrelink-su415.pdf`
- `tenancy-application-nsw.pdf`
- `tenancy-application-vic.pdf`
- `superannuation-hardship.pdf`

This legacy Python generator is awaiting migration into the canonical JavaScript generator. Do not remove it until all five assets have been migrated.

The former `generate_templates.py` duplicate was retired because all eight of its outputs overlap the canonical JavaScript generator. Generated files under `public/templates` remain tracked artifacts and must not be regenerated or changed as part of generator-ownership maintenance.
