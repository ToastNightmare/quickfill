import {
  templates,
  type TemplateConfig,
  type TemplateDirectoryItem,
} from "./templates-config";

export type {
  TemplateDirectoryItem,
  TemplateSourceKind,
  TemplateType,
} from "./templates-config";

function toTemplateDirectoryItem(template: TemplateConfig): TemplateDirectoryItem {
  return {
    file: template.file,
    ...(template.slug ? { slug: template.slug } : {}),
    ...(template.formCode ? { formCode: template.formCode } : {}),
    title: template.title,
    description: template.description,
    category: template.category,
    agency: template.agency,
    pageCount: template.pageCount,
    estimatedTime: template.estimatedTime,
    commonUse: template.commonUse,
    templateType: template.templateType,
    sourceKind: template.sourceKind,
    ...(template.badge ? { badge: template.badge } : {}),
    ...(template.popular === undefined ? {} : { popular: template.popular }),
    ...(template.hideFromMainGrid === undefined
      ? {}
      : { hideFromMainGrid: template.hideFromMainGrid }),
    ...(template.qualityNote ? { qualityNote: template.qualityNote } : {}),
    ...(template.allowFill === undefined ? {} : { allowFill: template.allowFill }),
    ...(template.indexable === undefined ? {} : { indexable: template.indexable }),
    tags: template.tags,
  };
}

export const templateDirectory: TemplateDirectoryItem[] = templates.map(toTemplateDirectoryItem);

export const visibleTemplateDirectory = templateDirectory.filter((template) => !template.hideFromMainGrid);

export const templateCount = visibleTemplateDirectory.length;
