// src/app/pipes/month-label.pipe.ts
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'monthLabel',
    standalone: true
})
export class MonthLabelPipe implements PipeTransform {
    transform(value: string): string {
        if (!value) return '';

        const [year, month] = value.split('-');

        const monthNames = [
            'Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun',
            'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];

        const monthIndex = parseInt(month) - 1;
        if (monthIndex < 0 || monthIndex > 11) return value;

        return `${monthNames[monthIndex]} ${year}`;
    }
}