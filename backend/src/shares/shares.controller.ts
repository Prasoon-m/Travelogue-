import { Controller, Delete, Get, Param, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateShareDto } from './dto/create-share.dto';
import { SharesService } from './shares.service';

@Controller('shares')
@UseGuards(JwtAuthGuard)
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @Get('outgoing')
  listOutgoing(@Req() req) {
    return this.sharesService.listOutgoing(req.user.id);
  }

  @Get('incoming')
  listIncoming(@Req() req) {
    return this.sharesService.listIncoming(req.user.id);
  }

  @Post()
  create(@Req() req, @Body() dto: CreateShareDto) {
    return this.sharesService.create(req.user.id, dto);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.sharesService.remove(req.user.id, id);
  }
}
