import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ViewsService } from './views.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ViewsController {
  constructor(private readonly viewsService: ViewsService) {}

  @Get('views')
  async listViews(@Req() req) {
    return this.viewsService.listViews(req.user.id);
  }

  @Post('views')
  async createView(@Req() req, @Body('name') name: string) {
    return this.viewsService.createView(req.user.id, name);
  }

  @Post('views/:id/bills')
  async addBillsToView(
    @Req() req,
    @Param('id') viewId: string,
    @Body('billIds') billIds: string[],
  ) {
    return this.viewsService.addBillsToView(req.user.id, viewId, billIds || []);
  }

  @Get('categories')
  async listCategories() {
    return this.viewsService.listCategories();
  }

  @Post('categories')
  async createCategory(
    @Body('name') name: string,
    @Body('subcategories') subcategories?: string[],
  ) {
    return this.viewsService.createCategory(name, subcategories);
  }
}

