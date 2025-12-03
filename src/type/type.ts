export interface MenuItem {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    image_url: string | null;
}

export interface Category {
    id: string;
    name: string;
    display_name: string;
    display_order: number;
    is_active: boolean;
}