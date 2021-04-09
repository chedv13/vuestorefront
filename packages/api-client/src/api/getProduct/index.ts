const filterAttachments = (attachments, type, ids) =>
  attachments.filter((e) => e.type === type && ids.includes(e.id));

const extractRelationships = (attachments, type, relationship, item) => {
  const itemIds = item.relationships[relationship].data.map((e) => e.id);

  return filterAttachments(attachments, type, itemIds);
};

const extractImagesRelationships = (attachments, product, variant) => {
  const productIds = product.relationships.images.data.map((e) => e.id);
  const variantIds = variant.relationships.images.data.map((e) => e.id);
  const imageIds = variantIds.concat(productIds);

  return filterAttachments(attachments, 'image', imageIds);
};

const formatProperties = (attachments, product) => {
  const properties = extractRelationships(attachments, 'product_property', 'product_properties', product);
  return properties.map(property => ({
    name: property.attributes.name,
    value: property.attributes.value
  }));
};

const formatProductVariant = (product, variant, attachments) => ({
  _id: product.id,
  _variantId: variant.id,
  _description: variant.attributes.description || product.attributes.description,
  _categoriesRef: product.relationships.taxons.data.map((t) => t.id),
  optionTypes: extractRelationships(attachments, 'option_type', 'option_types', product),
  optionValues: extractRelationships(attachments, 'option_value', 'option_values', variant),
  images: extractImagesRelationships(attachments, product, variant),
  properties: formatProperties(attachments, product),
  ...product.attributes,
  ...variant.attributes
});

const findProductVariants = (product, attachments) =>
  attachments.filter((e) => e.type === 'variant' && e.relationships.product.data.id === product.id);

const getVariants = (productsData) =>
  productsData.data.flatMap((product) => {
    const attachments = productsData.included;
    const variants = findProductVariants(product, attachments);
    return variants.map((variant) => formatProductVariant(product, variant, attachments));
  });

const getLimitedVariants = (productsData) =>
  productsData.data.map((product) => {
    const attachments = productsData.included;
    const variants = findProductVariants(product, attachments);
    const defaultVariant = variants.find((e) => e.attributes.is_master) || variants[0];

    return formatProductVariant(product, defaultVariant, attachments);
  });

const addHostToImageUrls = (image, context) => ({
  ...image,
  attributes: {
    ...image.attributes,
    styles: image.attributes?.styles ? image.attributes.styles.map((style) => ({
      width: style.width,
      height: style.height,
      url: context.config.backendUrl.concat(style.url)
    })) : []
  }
});

const addHostToUrls = (attachments, context) =>
  attachments.map((e) =>
    e.type === 'image' ? addHostToImageUrls(e, context) : e
  );

const preprocessProductsData = (productsData, context) => ({
  ...productsData,
  included: addHostToUrls(productsData.included, context)
});

export default async function getProduct(context, params) {
  const result = await context.client.products.list({
    filter: {
      ids: params.id,
      taxons: params.catId
    },
    include: 'variants.option_values,option_types,product_properties,images',
    page: 1,
    // eslint-disable-next-line camelcase
    per_page: params.limit || 10
  });

  if (result.isSuccess()) {
    const productsData = preprocessProductsData(result.success(), context);
    return params.limit ? getLimitedVariants(productsData) : getVariants(productsData);
  } else {
    throw result.fail();
  }
}

