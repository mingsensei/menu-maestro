export interface MenuItem {
    id: string;
    name: string;
    description: string;
    description_ko: string | null;
    description_ja: string | null;
    description_cn: string | null;
    description_vi: string | null;
    description_ru: string | null;
    description_kz: string | null;
    description_es: string | null;
    description_fr: string | null;
    description_it: string | null;
    price: number;
    vat: number;
    category_id: string | null;
    image_url: string | null;
}

export interface Category {
    id: string;
    name: string;
    display_name: string;
    display_order: number;
    is_active: boolean;
}
